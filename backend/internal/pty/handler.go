package pty

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/session"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 120 * time.Second
	pingPeriod = 30 * time.Second
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     isAllowedOrigin,
}

func isAllowedOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	host := r.Host
	return strings.HasPrefix(origin, "http://"+host) || strings.HasPrefix(origin, "https://"+host)
}

type Handler struct {
	manager    *Manager
	registry   *session.Registry
	tokenStore *auth.AttachmentTokenStore
}

func NewHandler(manager *Manager, registry *session.Registry, tokenStore *auth.AttachmentTokenStore) *Handler {
	return &Handler{
		manager:    manager,
		registry:   registry,
		tokenStore: tokenStore,
	}
}

type ControlMessage struct {
	Type    string `json:"type"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
	Message string `json:"message,omitempty"`
	Text    string `json:"text,omitempty"`
}

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Get token and session from query parameters
	token := r.URL.Query().Get("token")
	sessionID := r.URL.Query().Get("session")

	if token == "" || sessionID == "" {
		http.Error(w, "missing token or session", http.StatusBadRequest)
		return
	}

	// Validate attachment token
	attachment, valid := h.tokenStore.Validate(token)
	if !valid {
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}

	// Verify session ID matches token
	if attachment.SessionID != sessionID {
		http.Error(w, "session mismatch", http.StatusUnauthorized)
		return
	}

	// Get session from registry
	sess := h.registry.Get(sessionID)
	if sess == nil {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	// Ensure PTY instance
	inst, err := h.manager.EnsureInstance(sessionID, sess.TmuxName)
	if err != nil {
		closeWithCode(conn, 4004, "session not found")
		return
	}

	// Add subscriber
	sub := inst.AddSubscriber(conn)

	// Start send goroutine
	go h.sendLoop(conn, sub, inst)

	// Read loop (blocking)
	h.readLoop(conn, inst, sub)

	// Cleanup
	inst.RemoveSubscriber(conn)
	h.manager.Release(sessionID)
	conn.Close()
}

func (h *Handler) readLoop(conn *websocket.Conn, inst *Instance, sub *Subscriber) {
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		switch messageType {
		case websocket.BinaryMessage:
			// PTY input
			inst.Write(data)
		case websocket.TextMessage:
			// Control message
			h.handleControl(data, inst, sub, conn)
		}
	}
}

func (h *Handler) handleControl(data []byte, inst *Instance, sub *Subscriber, conn *websocket.Conn) {
	var msg ControlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "resize":
		if msg.Cols > 0 && msg.Rows > 0 {
			_ = inst.Resize(uint16(msg.Cols), uint16(msg.Rows))
		}
	case "ping":
		response := ControlMessage{Type: "pong"}
		if respData, err := json.Marshal(response); err == nil {
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			conn.WriteMessage(websocket.TextMessage, respData)
		}
	case "pause":
		sub.SetPaused(true)
	case "resume":
		sub.SetPaused(false)
	}
}

func (h *Handler) sendLoop(conn *websocket.Conn, sub *Subscriber, inst *Instance) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case data, ok := <-sub.SendCh:
			if !ok {
				return
			}
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			// Check if it's an error message (JSON text)
			if len(data) > 0 && data[0] == '{' {
				if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
					return
				}
				// After error message, close with appropriate code
				if inst.IsClosed() {
					closeWithCode(conn, 4100, "pty exited")
					return
				}
			} else {
				if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
					return
				}
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func closeWithCode(conn *websocket.Conn, code int, reason string) {
	msg := websocket.FormatCloseMessage(code, reason)
	conn.WriteControl(websocket.CloseMessage, msg, time.Now().Add(writeWait))
	conn.Close()
}
