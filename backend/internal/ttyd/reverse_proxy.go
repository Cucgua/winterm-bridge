package ttyd

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// ReverseProxy handles HTTP and WebSocket reverse proxy to ttyd instances
type ReverseProxy struct {
	manager *Manager
}

// NewReverseProxy creates a new reverse proxy handler
func NewReverseProxy(manager *Manager) *ReverseProxy {
	return &ReverseProxy{manager: manager}
}

// ServeHTTP handles requests to /ttyd/{sessionID}/*
func (rp *ReverseProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("[ttyd-proxy] Request: %s %s", r.Method, r.URL.Path)

	// Parse path: /ttyd/{sessionID}/...
	path := strings.TrimPrefix(r.URL.Path, "/ttyd/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "missing session ID", http.StatusBadRequest)
		return
	}

	sessionID := parts[0]
	subPath := "/"
	if len(parts) > 1 {
		subPath = "/" + parts[1]
	}

	// Get ttyd instance for this session
	inst := rp.manager.GetInstance(sessionID)
	if inst == nil {
		http.Error(w, "session not found or ttyd not running", http.StatusNotFound)
		return
	}

	inst.Touch()

	// Handle WebSocket upgrade
	if isWebSocketRequest(r) {
		rp.proxyWebSocket(w, r, inst, subPath)
		return
	}

	// Regular HTTP reverse proxy
	targetURL, _ := url.Parse(fmt.Sprintf("http://%s:%d", inst.bindHost, inst.Port))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = subPath
		req.Host = targetURL.Host
	}

	proxy.ServeHTTP(w, r)
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func (rp *ReverseProxy) proxyWebSocket(w http.ResponseWriter, r *http.Request, inst *Instance, subPath string) {
	log.Printf("[ttyd-proxy] WebSocket upgrade request, subPath: %s", subPath)

	// Upgrade client connection with 'tty' subprotocol
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     func(r *http.Request) bool { return true },
		Subprotocols:    []string{"tty"},
	}

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ttyd-proxy] Failed to upgrade client: %v", err)
		return
	}

	log.Printf("[ttyd-proxy] Client WebSocket upgraded")

	// Connect to ttyd with "tty" subprotocol
	targetURL := fmt.Sprintf("ws://%s:%d%s", inst.bindHost, inst.Port, subPath)
	dialer := websocket.Dialer{
		Subprotocols: []string{"tty"},
	}

	ttydConn, _, err := dialer.Dial(targetURL, nil)
	if err != nil {
		log.Printf("[ttyd-proxy] Failed to connect to ttyd: %v", err)
		clientConn.Close()
		return
	}

	log.Printf("[ttyd-proxy] WebSocket connected: %s", targetURL)

	// Use sync.Once to ensure connections are closed only once
	var closeOnce sync.Once
	closeBoth := func() {
		closeOnce.Do(func() {
			clientConn.Close()
			ttydConn.Close()
		})
	}
	defer closeBoth()

	errCh := make(chan error, 2)

	// Client -> ttyd
	go func() {
		for {
			mt, data, err := clientConn.ReadMessage()
			if err != nil {
				errCh <- err
				closeBoth()
				return
			}
			if err := ttydConn.WriteMessage(mt, data); err != nil {
				errCh <- err
				closeBoth()
				return
			}
		}
	}()

	// ttyd -> Client
	go func() {
		for {
			mt, data, err := ttydConn.ReadMessage()
			if err != nil {
				errCh <- err
				closeBoth()
				return
			}
			if err := clientConn.WriteMessage(mt, data); err != nil {
				errCh <- err
				closeBoth()
				return
			}
		}
	}()

	// Wait for first error
	err = <-errCh
	if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
		log.Printf("[ttyd-proxy] Proxy closed normally")
	} else if err != nil {
		log.Printf("[ttyd-proxy] Proxy error: %v", err)
	}
}
