package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
)

const (
	writeWait      = 10 * time.Second
	readWait       = 120 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 1 << 20
	sendQueueSize  = 1024
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
	registry   *session.Registry
	tokenStore *auth.AttachmentTokenStore
}

func NewHandler(registry *session.Registry, tokenStore *auth.AttachmentTokenStore) *Handler {
	return &Handler{
		registry:   registry,
		tokenStore: tokenStore,
	}
}

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Get attachment_token from URL query parameter
	attachmentToken := r.URL.Query().Get("attachment_token")
	if attachmentToken == "" {
		http.Error(w, "missing attachment_token", http.StatusUnauthorized)
		return
	}

	// Validate attachment token (one-time use)
	attachment, valid := h.tokenStore.Validate(attachmentToken)
	if !valid {
		http.Error(w, "invalid or expired attachment_token", http.StatusUnauthorized)
		return
	}

	log.Printf("[WS] Attachment token validated for session %s", attachment.SessionID[:8])

	// Upgrade to WebSocket
	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer wsConn.Close()

	wsConn.SetReadLimit(maxMessageSize)
	_ = wsConn.SetReadDeadline(time.Now().Add(readWait))
	wsConn.SetPongHandler(func(string) error {
		return wsConn.SetReadDeadline(time.Now().Add(readWait))
	})

	// Attach to session
	sess, err := h.registry.Attach(attachment.SessionID, attachment.UserToken, wsConn)
	if err != nil {
		log.Printf("[WS] Failed to attach to session: %v", err)
		_ = sendControl(wsConn, TypeError, ErrorPayload{Message: err.Error()})
		return
	}

	defer func() {
		_ = h.registry.Detach(sess.ID, wsConn)
	}()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sendCh := make(chan []byte, sendQueueSize)

	// Register this client with the session
	if err := h.registry.RegisterClient(sess.ID, wsConn, sendCh); err != nil {
		log.Printf("[WS] Failed to register client: %v", err)
		return
	}

	// Create tmux client for this WebSocket
	tmuxClient, err := sess.AttachTmuxClient(wsConn, 80, 24)
	if err != nil {
		log.Printf("[WS] Failed to create tmux client: %v", err)
		return
	}

	if tmuxClient != nil {
		go h.tmuxReadLoop(ctx, wsConn, tmuxClient, sendCh)
		// Capture initial screen content after a short delay
		go func() {
			time.Sleep(100 * time.Millisecond)
			if err := tmuxClient.CapturePane(); err != nil {
				log.Printf("[WS] Failed to capture initial pane: %v", err)
			}
		}()
	}

	go h.wsWriteLoop(ctx, cancel, wsConn, sendCh)

	// Start ping ticker to keep connection alive
	pingTicker := time.NewTicker(pingPeriod)
	defer pingTicker.Stop()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-pingTicker.C:
				_ = wsConn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := wsConn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// Main message loop - only handle resize, ping/pong, and binary data
	for {
		msgType, payload, err := wsConn.ReadMessage()
		if err != nil {
			break
		}
		sess.Touch()

		switch msgType {
		case websocket.TextMessage:
			h.handleControl(wsConn, sess, tmuxClient, payload)
		case websocket.BinaryMessage:
			if tmuxClient != nil {
				_ = tmuxClient.SendKeys(string(payload))
			}
		}
	}
}

func (h *Handler) handleControl(wsConn *websocket.Conn, sess *session.Session, tmuxClient *tmux.Client, data []byte) {
	var msg ControlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		// Non-JSON data, send as input to tmux
		if tmuxClient != nil {
			_ = tmuxClient.SendKeys(string(data))
		}
		return
	}

	switch msg.Type {
	case TypeResize:
		var resize ResizePayload
		if err := json.Unmarshal(msg.Payload, &resize); err != nil {
			return
		}
		if resize.Cols > 0 && resize.Rows > 0 && tmuxClient != nil {
			_ = tmuxClient.Resize(resize.Cols, resize.Rows)
		}
	case TypePing:
		_ = sendControl(wsConn, TypePong, nil)

	// Legacy message types - kept for backward compatibility but no longer used
	// These operations are now handled via HTTP API
	case TypeAuth, TypeListSessions, TypeSelectSession, TypeCreateSession, TypeDeleteSession:
		log.Printf("[WS] Deprecated message type received: %s (use HTTP API instead)", msg.Type)
		_ = sendControl(wsConn, TypeError, ErrorPayload{
			Message: "this operation is now handled via HTTP API",
		})
	}
}

func (h *Handler) wsWriteLoop(ctx context.Context, cancel context.CancelFunc, wsConn *websocket.Conn, sendCh <-chan []byte) {
	log.Println("[WS] Starting write loop...")
	for {
		select {
		case <-ctx.Done():
			log.Println("[WS] Write loop cancelled")
			return
		case data, ok := <-sendCh:
			if !ok {
				log.Println("[WS] Send channel closed")
				return
			}
			log.Printf("[WS] Sending %d bytes to client", len(data))
			_ = wsConn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := wsConn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				log.Printf("[WS] Write error: %v", err)
				cancel()
				return
			}
			log.Printf("[WS] Sent %d bytes successfully", len(data))
		}
	}
}

func sendControl(wsConn *websocket.Conn, msgType string, payload any) error {
	var raw json.RawMessage
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		raw = data
	}
	msg := ControlMessage{Type: msgType, Payload: raw}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_ = wsConn.SetWriteDeadline(time.Now().Add(writeWait))
	return wsConn.WriteMessage(websocket.TextMessage, data)
}

// tmuxReadLoop reads output from tmux client and sends to WebSocket
func (h *Handler) tmuxReadLoop(ctx context.Context, wsConn *websocket.Conn, tmuxClient *tmux.Client, sendCh chan<- []byte) {
	log.Printf("[TMUX] Starting read loop for client %s...", tmuxClient.ClientID)

	done := make(chan struct{})
	go func() {
		defer close(done)
		err := tmuxClient.ReadOutput(func(data []byte) {
			select {
			case <-ctx.Done():
				return
			case sendCh <- data:
				log.Printf("[TMUX] Sent %d bytes to client %s", len(data), tmuxClient.ClientID)
			default:
				log.Printf("[TMUX] Warning: send channel full for client %s", tmuxClient.ClientID)
			}
		})
		if err != nil {
			log.Printf("[TMUX] ReadOutput error for client %s: %v", tmuxClient.ClientID, err)
		}
	}()

	select {
	case <-ctx.Done():
		log.Printf("[TMUX] Read loop cancelled for client %s", tmuxClient.ClientID)
	case <-done:
		log.Printf("[TMUX] Read loop completed for client %s", tmuxClient.ClientID)
	}
}
