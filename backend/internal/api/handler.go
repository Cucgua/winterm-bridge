package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/pty"
	"winterm-bridge/internal/session"
)

// Handler handles HTTP REST API requests
type Handler struct {
	registry   *session.Registry
	tokenStore *auth.AttachmentTokenStore
	ptyManager *pty.Manager
}

// NewHandler creates a new HTTP API handler
func NewHandler(registry *session.Registry, tokenStore *auth.AttachmentTokenStore, ptyManager *pty.Manager) *Handler {
	return &Handler{
		registry:   registry,
		tokenStore: tokenStore,
		ptyManager: ptyManager,
	}
}

// Request/Response types

type AuthRequest struct {
	PIN string `json:"pin"`
}

type AuthResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

type ValidateResponse struct {
	Valid bool `json:"valid"`
}

type SessionInfo struct {
	ID         string    `json:"id"`
	State      string    `json:"state"`
	CreatedAt  time.Time `json:"created_at"`
	LastActive time.Time `json:"last_active"`
	Title      string    `json:"title,omitempty"`
	TmuxName   string    `json:"tmux_name,omitempty"`
	TmuxCmd    string    `json:"tmux_cmd,omitempty"`
}

type SessionsResponse struct {
	Sessions []SessionInfo `json:"sessions"`
}

type CreateSessionRequest struct {
	Title string `json:"title,omitempty"`
}

type CreateSessionResponse struct {
	Session SessionInfo `json:"session"`
}

type AttachResponse struct {
	AttachmentToken string `json:"attachment_token"`
	ExpiresIn       int    `json:"expires_in"` // seconds
	WsURL           string `json:"ws_url"`     // WebSocket URL (relative path)
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// Helper functions

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{Error: message})
}

func sessionStateString(state session.SessionState) string {
	switch state {
	case session.SessionActive:
		return "active"
	case session.SessionDetached:
		return "detached"
	case session.SessionTerminated:
		return "terminated"
	default:
		return "unknown"
	}
}

func sessionToInfo(s *session.Session) SessionInfo {
	state, createdAt, lastActive, title := s.Snapshot()
	tmuxCmd := ""
	if s.TmuxName != "" {
		tmuxCmd = "tmux attach-session -t " + s.TmuxName
	}
	return SessionInfo{
		ID:         s.ID,
		State:      sessionStateString(state),
		CreatedAt:  createdAt,
		LastActive: lastActive,
		Title:      title,
		TmuxName:   s.TmuxName,
		TmuxCmd:    tmuxCmd,
	}
}

// API Handlers

// HandleAuth handles POST /api/auth - PIN authentication
func (h *Handler) HandleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.PIN == "" {
		writeError(w, http.StatusBadRequest, "missing PIN")
		return
	}

	if !auth.ValidatePIN(req.PIN) {
		writeError(w, http.StatusUnauthorized, "invalid PIN")
		return
	}

	token := auth.GenerateToken()
	if token == "" {
		writeError(w, http.StatusInternalServerError, "token generation failed")
		return
	}

	log.Printf("[API] PIN authenticated, token: %s...", token[:8])
	writeJSON(w, http.StatusOK, AuthResponse{
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour), // Token expires in 24 hours
	})
}

// HandleValidate handles POST /api/auth/validate - Token validation
func (h *Handler) HandleValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Token is already validated by middleware if we get here
	writeJSON(w, http.StatusOK, ValidateResponse{Valid: true})
}

// HandleListSessions handles GET /api/sessions - Get session list
func (h *Handler) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	tokenVal := r.Context().Value(TokenContextKey)
	if tokenVal == nil {
		writeError(w, http.StatusUnauthorized, "no token in context")
		return
	}
	token := tokenVal.(string)
	sessions := h.registry.ListByToken(token)

	infos := make([]SessionInfo, 0, len(sessions))
	for _, s := range sessions {
		infos = append(infos, sessionToInfo(s))
	}

	writeJSON(w, http.StatusOK, SessionsResponse{Sessions: infos})
}

// HandleCreateSession handles POST /api/sessions - Create new session
func (h *Handler) HandleCreateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	token := r.Context().Value(TokenContextKey).(string)

	var req CreateSessionRequest
	// Allow empty body
	_ = json.NewDecoder(r.Body).Decode(&req)

	sess, err := h.registry.CreateWithTitle(token, req.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusCreated, CreateSessionResponse{Session: sessionToInfo(sess)})
}

// HandleDeleteSession handles DELETE /api/sessions/{id} - Delete session
func (h *Handler) HandleDeleteSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-1]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	if err := h.registry.Delete(sessionID); err != nil {
		if err == session.ErrSessionNotFound {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete session")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleAttachSession handles POST /api/sessions/{id}/attach - Get attachment token
func (h *Handler) HandleAttachSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	tokenVal := r.Context().Value(TokenContextKey)
	if tokenVal == nil {
		writeError(w, http.StatusUnauthorized, "no token in context")
		return
	}
	token := tokenVal.(string)

	// Extract session ID from path: /api/sessions/{id}/attach
	path := r.URL.Path
	parts := strings.Split(path, "/")
	// Expected: ["", "api", "sessions", "{id}", "attach"]
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	// Get the session to find tmux name
	sess := h.registry.Get(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	// Verify tmux session exists (PTY instance will be created on WS connect)
	_, err := h.ptyManager.EnsureInstance(sessionID, sess.TmuxName)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			_ = h.registry.Delete(sessionID)
			writeError(w, http.StatusNotFound, "session no longer exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to start terminal: "+err.Error())
		return
	}
	// Release immediately - actual connection will call EnsureInstance again
	h.ptyManager.Release(sessionID)

	// Generate attachment token
	attachment := h.tokenStore.Generate(sessionID, token)

	// WebSocket URL with token and session
	wsURL := "/ws?token=" + attachment.Token + "&session=" + sessionID

	writeJSON(w, http.StatusOK, AttachResponse{
		AttachmentToken: attachment.Token,
		ExpiresIn:       int(auth.AttachmentTokenExpiry.Seconds()),
		WsURL:           wsURL,
	})
}
