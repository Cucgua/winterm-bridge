package ws

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/ttyd"
)

const (
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
	ttydMgr    *ttyd.Manager
}

func NewHandler(registry *session.Registry, tokenStore *auth.AttachmentTokenStore) *Handler {
	return &Handler{
		registry:   registry,
		tokenStore: tokenStore,
		ttydMgr:    ttyd.NewManager(ttyd.Config{}),
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

	// Get session to retrieve tmux name
	sess := h.registry.Get(attachment.SessionID)
	if sess == nil {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket
	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer wsConn.Close()

	wsConn.SetReadLimit(maxMessageSize)

	// Ensure ttyd instance is running for this session
	inst, err := h.ttydMgr.EnsureInstance(sess.ID, sess.TmuxName)
	if err != nil {
		log.Printf("[WS] Failed to ensure ttyd instance: %v", err)
		return
	}
	defer h.ttydMgr.Release(sess.ID)

	log.Printf("[WS] Proxying to ttyd at %s for session %s", inst.WSURL(), sess.ID[:8])

	// Proxy WebSocket to ttyd
	if err := ttyd.ProxyWS(wsConn, inst.WSURL()); err != nil {
		log.Printf("[WS] Proxy error: %v", err)
	}

	log.Printf("[WS] Connection closed for session %s", sess.ID[:8])
}
