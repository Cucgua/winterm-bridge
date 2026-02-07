package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
	"winterm-bridge/internal/llm"
	"winterm-bridge/internal/monitor"
	"winterm-bridge/internal/pty"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
)

// Handler handles HTTP REST API requests
type Handler struct {
	registry       *session.Registry
	tokenStore     *auth.AttachmentTokenStore
	ptyManager     *pty.Manager
	monitorService *monitor.Service
}

// NewHandler creates a new HTTP API handler
func NewHandler(registry *session.Registry, tokenStore *auth.AttachmentTokenStore, ptyManager *pty.Manager, monitorService *monitor.Service) *Handler {
	return &Handler{
		registry:       registry,
		tokenStore:     tokenStore,
		ptyManager:     ptyManager,
		monitorService: monitorService,
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
	ID           string    `json:"id"`
	State        string    `json:"state"`
	CreatedAt    time.Time `json:"created_at"`
	LastActive   time.Time `json:"last_active"`
	Title        string    `json:"title,omitempty"`
	TmuxName     string    `json:"tmux_name,omitempty"`
	TmuxCmd      string    `json:"tmux_cmd,omitempty"`
	CurrentPath  string    `json:"current_path,omitempty"`
	IsPersistent bool      `json:"is_persistent"`
	IsGhost      bool      `json:"is_ghost"`
	IsArchived   bool      `json:"is_archived"`
}

type SessionsResponse struct {
	Sessions []SessionInfo `json:"sessions"`
}

type CreateSessionRequest struct {
	Title            string `json:"title,omitempty"`
	WorkingDirectory string `json:"working_directory,omitempty"`
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
	if s.TmuxName != "" && !s.IsGhost {
		tmuxCmd = "tmux attach-session -t " + s.TmuxName
	}
	currentPath := ""
	if !s.IsGhost {
		currentPath = s.GetCurrentPath()
	}
	return SessionInfo{
		ID:           s.ID,
		State:        sessionStateString(state),
		CreatedAt:    createdAt,
		LastActive:   lastActive,
		Title:        title,
		TmuxName:     s.TmuxName,
		TmuxCmd:      tmuxCmd,
		CurrentPath:  currentPath,
		IsPersistent: s.IsPersistent,
		IsGhost:      s.IsGhost,
		IsArchived:   s.IsArchived,
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

	// Scan for new/deleted tmux sessions before listing
	h.registry.DiscoverExisting()

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

	sess, err := h.registry.CreateWithTitle(token, req.Title, req.WorkingDirectory)
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

	// If ghost session, revive it first
	if sess.IsGhost {
		if err := h.registry.ReviveGhostSession(sessionID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to revive session: "+err.Error())
			return
		}
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

// HandlePersistSession handles POST /api/sessions/{id}/persist - Mark session as persistent
func (h *Handler) HandlePersistSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path: /api/sessions/{id}/persist
	path := r.URL.Path
	parts := strings.Split(path, "/")
	// Expected: ["", "api", "sessions", "{id}", "persist"]
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	if err := h.registry.PersistSession(sessionID); err != nil {
		if err == session.ErrSessionNotFound {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to persist session: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleUnpersistSession handles DELETE /api/sessions/{id}/persist - Remove persistence marking
func (h *Handler) HandleUnpersistSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path: /api/sessions/{id}/persist
	path := r.URL.Path
	parts := strings.Split(path, "/")
	// Expected: ["", "api", "sessions", "{id}", "persist"]
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	if err := h.registry.UnpersistSession(sessionID); err != nil {
		if err == session.ErrSessionNotFound {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unpersist session: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleArchiveSession handles POST /api/sessions/{id}/archive - Archive a persistent session
func (h *Handler) HandleArchiveSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path: /api/sessions/{id}/archive
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	if err := h.registry.ArchiveSession(sessionID); err != nil {
		if err == session.ErrSessionNotFound {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to archive session: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleUnarchiveSession handles DELETE /api/sessions/{id}/archive - Unarchive a session
func (h *Handler) HandleUnarchiveSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path: /api/sessions/{id}/archive
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	if err := h.registry.UnarchiveSession(sessionID); err != nil {
		if err == session.ErrSessionNotFound {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unarchive session: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// FontInfo represents a font file available for the web frontend
type FontInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// FontsResponse is the response for GET /api/fonts
type FontsResponse struct {
	Fonts []FontInfo `json:"fonts"`
}

// HandleListFonts handles GET /api/fonts - List available custom fonts
func (h *Handler) HandleListFonts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		writeJSON(w, http.StatusOK, FontsResponse{Fonts: []FontInfo{}})
		return
	}

	fontsDir := filepath.Join(homeDir, ".config", "winterm-bridge", "fonts")
	entries, err := os.ReadDir(fontsDir)
	if err != nil {
		writeJSON(w, http.StatusOK, FontsResponse{Fonts: []FontInfo{}})
		return
	}

	fonts := []FontInfo{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext == ".ttf" || ext == ".otf" || ext == ".woff" || ext == ".woff2" {
			fonts = append(fonts, FontInfo{
				Name: name,
				URL:  "/api/fonts/" + name,
			})
		}
	}

	writeJSON(w, http.StatusOK, FontsResponse{Fonts: fonts})
}

// HandleServeFont handles GET /api/fonts/{filename} - Serve font file
func (h *Handler) HandleServeFont(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract font filename from path: /api/fonts/{filename}
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		writeError(w, http.StatusBadRequest, "missing font filename")
		return
	}
	filename := parts[len(parts)-1]

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	// Only allow font file extensions
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".ttf" && ext != ".otf" && ext != ".woff" && ext != ".woff2" {
		writeError(w, http.StatusBadRequest, "invalid font type")
		return
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot determine home directory")
		return
	}

	fontPath := filepath.Join(homeDir, ".config", "winterm-bridge", "fonts", filename)
	if _, err := os.Stat(fontPath); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "font not found")
		return
	}

	// Set content type based on extension
	var contentType string
	switch ext {
	case ".ttf":
		contentType = "font/ttf"
	case ".otf":
		contentType = "font/otf"
	case ".woff":
		contentType = "font/woff"
	case ".woff2":
		contentType = "font/woff2"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 1 day

	http.ServeFile(w, r, fontPath)
}

// HandleAIConfig handles GET/POST /api/ai/config - AI monitor configuration
func (h *Handler) HandleAIConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleGetAIConfig(w, r)
	case http.MethodPost:
		h.handleSetAIConfig(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) handleGetAIConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.monitorService.GetConfig()

	// Mask API key for security
	maskedKey := ""
	if cfg.APIKey != "" {
		if len(cfg.APIKey) > 8 {
			maskedKey = cfg.APIKey[:4] + "****" + cfg.APIKey[len(cfg.APIKey)-4:]
		} else {
			maskedKey = "****"
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":      cfg.Enabled,
		"endpoint":     cfg.Endpoint,
		"api_key":      maskedKey,
		"model":        cfg.Model,
		"lines":        cfg.Lines,
		"interval":     cfg.Interval,
		"extra_params": cfg.ExtraParams,
		"running":      h.monitorService.IsRunning(),
	})
}

func (h *Handler) handleSetAIConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled     *bool   `json:"enabled"`
		Endpoint    *string `json:"endpoint"`
		APIKey      *string `json:"api_key"`
		Model       *string `json:"model"`
		Lines       *int    `json:"lines"`
		Interval    *int    `json:"interval"`
		ExtraParams *string `json:"extra_params"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get current config and apply updates
	cfg := h.monitorService.GetConfig()

	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
		// When disabling AI, also disable all session auto-reply to avoid orphaned states
		if !*req.Enabled {
			sessionIDs := config.GetAllSessionAutoEnabled()
			for _, sid := range sessionIDs {
				config.SetSessionAutoEnabled(sid, false)
			}
			if len(sessionIDs) > 0 {
				log.Printf("[API] AI disabled: cleared auto-reply for %d sessions", len(sessionIDs))
			}
		}
	}
	if req.Endpoint != nil && *req.Endpoint != "" {
		cfg.Endpoint = *req.Endpoint
	}
	if req.APIKey != nil && *req.APIKey != "" && !strings.Contains(*req.APIKey, "****") {
		cfg.APIKey = *req.APIKey
	}
	if req.Model != nil && *req.Model != "" {
		cfg.Model = *req.Model
	}
	if req.Lines != nil && *req.Lines > 0 {
		cfg.Lines = *req.Lines
	}
	if req.Interval != nil && *req.Interval >= 5 {
		cfg.Interval = *req.Interval
	}
	if req.ExtraParams != nil {
		cfg.ExtraParams = *req.ExtraParams
	}

	// Save to config file
	aiCfg := &config.AIMonitorConfig{
		Enabled:     cfg.Enabled,
		Endpoint:    cfg.Endpoint,
		APIKey:      cfg.APIKey,
		Model:       cfg.Model,
		Lines:       cfg.Lines,
		Interval:    cfg.Interval,
		ExtraParams: cfg.ExtraParams,
	}
	if err := config.SaveAIMonitorConfig(aiCfg); err != nil {
		log.Printf("[API] Failed to save AI config: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	// Update monitor service
	h.monitorService.UpdateConfig(cfg)

	log.Printf("[API] AI monitor config updated (enabled=%v, model=%s)", cfg.Enabled, cfg.Model)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"running": h.monitorService.IsRunning(),
	})
}

// HandleAITest handles POST /api/ai/test - Test AI connection
func (h *Handler) HandleAITest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Endpoint == "" || req.APIKey == "" || req.Model == "" {
		writeError(w, http.StatusBadRequest, "endpoint, api_key, and model are required")
		return
	}

	// If API key contains mask, use saved one
	if strings.Contains(req.APIKey, "****") {
		cfg := h.monitorService.GetConfig()
		req.APIKey = cfg.APIKey
	}

	testCfg := monitor.Config{
		Endpoint: req.Endpoint,
		APIKey:   req.APIKey,
		Model:    req.Model,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := h.monitorService.TestConnection(ctx, testCfg); err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true,
	})
}

// HandleAISummaries handles GET /api/ai/summaries - Get all session AI summaries
func (h *Handler) HandleAISummaries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Get all sessions
	tokenVal := r.Context().Value(TokenContextKey)
	if tokenVal == nil {
		writeError(w, http.StatusUnauthorized, "no token in context")
		return
	}
	token := tokenVal.(string)

	sessions := h.registry.ListByToken(token)

	// Collect summaries for all sessions
	summaries := make(map[string]interface{})
	for _, sess := range sessions {
		if summary := h.monitorService.GetSummary(sess.ID); summary != nil {
			summaries[sess.ID] = map[string]interface{}{
				"tag":         summary.Tag,
				"description": summary.Description,
				"timestamp":   summary.Timestamp,
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries": summaries,
	})
}

// HandleEmailConfig handles GET/POST /api/email/config - Email notification configuration
func (h *Handler) HandleEmailConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleGetEmailConfig(w, r)
	case http.MethodPost:
		h.handleSetEmailConfig(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) handleGetEmailConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.monitorService.GetEmailConfig()

	// Mask password for security
	maskedPassword := ""
	if cfg.Password != "" {
		maskedPassword = "****"
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":      cfg.Enabled,
		"smtp_host":    cfg.SMTPHost,
		"smtp_port":    cfg.SMTPPort,
		"username":     cfg.Username,
		"password":     maskedPassword,
		"from_address": cfg.FromAddress,
		"to_address":   cfg.ToAddress,
		"notify_delay": cfg.NotifyDelay,
	})
}

func (h *Handler) handleSetEmailConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled     *bool   `json:"enabled"`
		SMTPHost    *string `json:"smtp_host"`
		SMTPPort    *int    `json:"smtp_port"`
		Username    *string `json:"username"`
		Password    *string `json:"password"`
		FromAddress *string `json:"from_address"`
		ToAddress   *string `json:"to_address"`
		NotifyDelay *int    `json:"notify_delay"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get current config and apply updates
	cfg := h.monitorService.GetEmailConfig()
	if cfg == nil {
		cfg = &config.EmailConfig{}
	}

	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}
	if req.SMTPHost != nil {
		cfg.SMTPHost = *req.SMTPHost
	}
	if req.SMTPPort != nil {
		cfg.SMTPPort = *req.SMTPPort
	}
	if req.Username != nil {
		cfg.Username = *req.Username
	}
	if req.Password != nil && *req.Password != "****" {
		cfg.Password = *req.Password
	}
	if req.FromAddress != nil {
		cfg.FromAddress = *req.FromAddress
	}
	if req.ToAddress != nil {
		cfg.ToAddress = *req.ToAddress
	}
	if req.NotifyDelay != nil {
		cfg.NotifyDelay = *req.NotifyDelay
	}

	// Save to config file
	if err := config.SaveEmailConfig(cfg); err != nil {
		log.Printf("[API] Failed to save email config: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	// Update monitor service
	h.monitorService.UpdateEmailConfig(cfg)

	log.Printf("[API] Email config updated (enabled=%v, host=%s)", cfg.Enabled, cfg.SMTPHost)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true,
	})
}

// HandleEmailTest handles POST /api/email/test - Send test email
func (h *Handler) HandleEmailTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := h.monitorService.TestEmail(); err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true,
	})
}

// HandleSessionNotify handles POST/DELETE /api/sessions/{id}/notify - Toggle session notification
func (h *Handler) HandleSessionNotify(w http.ResponseWriter, r *http.Request) {
	// Extract session ID from path: /api/sessions/{id}/notify
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	// Verify session exists
	sess := h.registry.Get(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	switch r.Method {
	case http.MethodPost:
		if err := config.SetSessionNotifyEnabled(sessionID, true); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to enable notification: "+err.Error())
			return
		}
		log.Printf("[API] Session %s notification enabled", sessionID[:8])
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		if err := config.SetSessionNotifyEnabled(sessionID, false); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to disable notification: "+err.Error())
			return
		}
		log.Printf("[API] Session %s notification disabled", sessionID[:8])
		w.WriteHeader(http.StatusNoContent)

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleSessionSettings handles GET /api/sessions/{id}/settings - Get session settings
func (h *Handler) HandleSessionSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Extract session ID from path: /api/sessions/{id}/settings
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	// Verify session exists and get persistence status
	sess := h.registry.Get(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	notifyEnabled := config.GetSessionNotifyEnabled(sessionID)
	autoEnabled := config.GetSessionAutoEnabled(sessionID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"notify_enabled": notifyEnabled,
		"auto_enabled":   autoEnabled,
		"is_persistent":  sess.IsPersistent,
	})
}

// HandleSessionAuto handles POST/DELETE /api/sessions/{id}/auto - Toggle session auto-reply
func (h *Handler) HandleSessionAuto(w http.ResponseWriter, r *http.Request) {
	// Extract session ID from path: /api/sessions/{id}/auto
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	sessionID := parts[len(parts)-2]

	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	// Verify session exists
	sess := h.registry.Get(sessionID)
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	switch r.Method {
	case http.MethodPost:
		if err := config.SetSessionAutoEnabled(sessionID, true); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to enable auto-reply: "+err.Error())
			return
		}
		log.Printf("[API] Session %s auto-reply enabled", sessionID[:8])
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		if err := config.SetSessionAutoEnabled(sessionID, false); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to disable auto-reply: "+err.Error())
			return
		}
		log.Printf("[API] Session %s auto-reply disabled", sessionID[:8])
		w.WriteHeader(http.StatusNoContent)

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleAutoConfig handles GET/POST /api/auto/config
func (h *Handler) HandleAutoConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cfg := config.GetAutoConfig()
		writeJSON(w, http.StatusOK, cfg)
	case http.MethodPost:
		var req config.AutoConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := config.SaveAutoConfig(&req); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save config")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleAutoStop handles POST /api/auto/stop - Emergency stop all sessions
func (h *Handler) HandleAutoStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Disable auto-reply for all sessions
	sessionIDs := config.GetAllSessionAutoEnabled()
	for _, sid := range sessionIDs {
		config.SetSessionAutoEnabled(sid, false)
	}
	log.Printf("[API] Emergency stop: disabled auto-reply for %d sessions", len(sessionIDs))
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "disabled_count": len(sessionIDs)})
}

// HandleAutoLogs handles GET/DELETE /api/auto/logs
func (h *Handler) HandleAutoLogs(w http.ResponseWriter, r *http.Request) {
	logger := h.monitorService.GetActionLogger()
	switch r.Method {
	case http.MethodGet:
		sessionID := r.URL.Query().Get("session_id")
		var logs interface{}
		if sessionID != "" {
			logs = logger.GetBySession(sessionID)
		} else {
			logs = logger.GetAll()
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"logs": logs})
	case http.MethodDelete:
		logger.Clear()
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleWorkflowEvents handles GET /api/workflow-events
func (h *Handler) HandleWorkflowEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}

	logger := h.monitorService.GetWorkflowLogger()
	events := logger.GetRecent(sessionID, limit)
	if events == nil {
		events = []monitor.WorkflowEvent{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"events": events})
}

// HandleAILogConfig handles GET/POST /api/ai/log-config
func (h *Handler) HandleAILogConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"enabled":  config.GetAILogEnabled(),
			"log_dir":  config.AILogDir(),
		})
	case http.MethodPost:
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := config.SetAILogEnabled(body.Enabled); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save config")
			return
		}
		llm.GetRequestLogger().SetEnabled(body.Enabled)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleAILogs handles GET/DELETE /api/ai/logs
func (h *Handler) HandleAILogs(w http.ResponseWriter, r *http.Request) {
	logger := llm.GetRequestLogger()
	switch r.Method {
	case http.MethodGet:
		date := r.URL.Query().Get("date")
		limitStr := r.URL.Query().Get("limit")
		limit := 100
		if limitStr != "" {
			if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
				limit = n
			}
		}

		if r.URL.Query().Get("dates") == "true" {
			// Return list of available dates
			dates, err := logger.ListLogDates()
			if err != nil {
				writeJSON(w, http.StatusOK, map[string]interface{}{"dates": []string{}})
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"dates": dates})
			return
		}

		logs, err := logger.GetLogs(limit, date)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"logs": []interface{}{}})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"logs": logs})
	case http.MethodDelete:
		if err := logger.ClearLogs(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to clear logs")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleTmuxConfig handles GET/POST /api/tmux/config - tmux terminal configuration
func (h *Handler) HandleTmuxConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleGetTmuxConfig(w, r)
	case http.MethodPost:
		h.handleSetTmuxConfig(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) handleGetTmuxConfig(w http.ResponseWriter, r *http.Request) {
	cfg := config.GetTmuxConfig()
	writeJSON(w, http.StatusOK, cfg)
}

func (h *Handler) handleSetTmuxConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		// Common settings
		Mouse           *bool   `json:"mouse"`
		SetClipboard    *bool   `json:"set_clipboard"`
		SetTitles       *bool   `json:"set_titles"`
		SetTitlesString *string `json:"set_titles_string"`
		Status          *bool   `json:"status"`
		RightClickMenu  *bool   `json:"right_click_menu"`
		// Advanced settings
		HistoryLimit     *int  `json:"history_limit"`
		EscapeTime       *int  `json:"escape_time"`
		ScrollSpeed      *int  `json:"scroll_speed"`
		AggressiveResize *bool `json:"aggressive_resize"`
		FocusEvents      *bool `json:"focus_events"`
		BaseIndex        *int  `json:"base_index"`
		PaneBaseIndex    *int  `json:"pane_base_index"`
		RenumberWindows  *bool `json:"renumber_windows"`
		VisualActivity   *bool `json:"visual_activity"`
		VisualBell       *bool `json:"visual_bell"`
		MonitorActivity  *bool `json:"monitor_activity"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get current config and apply updates
	cfg := config.GetTmuxConfig()

	// Common settings
	if req.Mouse != nil {
		cfg.Mouse = *req.Mouse
	}
	if req.SetClipboard != nil {
		cfg.SetClipboard = *req.SetClipboard
	}
	if req.SetTitles != nil {
		cfg.SetTitles = *req.SetTitles
	}
	if req.SetTitlesString != nil {
		cfg.SetTitlesString = *req.SetTitlesString
	}
	if req.Status != nil {
		cfg.Status = *req.Status
	}
	if req.RightClickMenu != nil {
		cfg.RightClickMenu = *req.RightClickMenu
	}
	// Advanced settings
	if req.HistoryLimit != nil && *req.HistoryLimit >= 1000 && *req.HistoryLimit <= 100000 {
		cfg.HistoryLimit = *req.HistoryLimit
	}
	if req.EscapeTime != nil && *req.EscapeTime >= 0 && *req.EscapeTime <= 50 {
		cfg.EscapeTime = *req.EscapeTime
	}
	if req.ScrollSpeed != nil && *req.ScrollSpeed >= 1 && *req.ScrollSpeed <= 10 {
		cfg.ScrollSpeed = *req.ScrollSpeed
	}
	if req.AggressiveResize != nil {
		cfg.AggressiveResize = *req.AggressiveResize
	}
	if req.FocusEvents != nil {
		cfg.FocusEvents = *req.FocusEvents
	}
	if req.BaseIndex != nil && (*req.BaseIndex == 0 || *req.BaseIndex == 1) {
		cfg.BaseIndex = *req.BaseIndex
	}
	if req.PaneBaseIndex != nil && (*req.PaneBaseIndex == 0 || *req.PaneBaseIndex == 1) {
		cfg.PaneBaseIndex = *req.PaneBaseIndex
	}
	if req.RenumberWindows != nil {
		cfg.RenumberWindows = *req.RenumberWindows
	}
	if req.VisualActivity != nil {
		cfg.VisualActivity = *req.VisualActivity
	}
	if req.VisualBell != nil {
		cfg.VisualBell = *req.VisualBell
	}
	if req.MonitorActivity != nil {
		cfg.MonitorActivity = *req.MonitorActivity
	}

	// Save to config file
	if err := config.SaveTmuxConfig(cfg); err != nil {
		log.Printf("[API] Failed to save tmux config: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	// Apply config to all sessions
	result, err := tmux.ApplyConfig(cfg)
	if err != nil {
		log.Printf("[API] Failed to apply tmux config: %v", err)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":       true,
			"applied":  false,
			"warnings": []string{"Failed to apply config: " + err.Error()},
			"config":   cfg,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":       true,
		"applied":  result.Applied,
		"warnings": result.Warnings,
		"config":   cfg,
	})
}
