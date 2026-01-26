package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"time"

	"winterm-bridge/internal/api"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
	"winterm-bridge/internal/ttyd"
	"winterm-bridge/internal/ws"
)

//go:embed static/*
var staticFS embed.FS

func main() {
	// Check tmux availability
	version, err := tmux.CheckTmuxAvailable()
	if err != nil {
		log.Fatalf("tmux not found: %v", err)
	}
	log.Printf("tmux detected: %s", version)

	pin := auth.InitPIN()
	log.Printf("WinTerm-Bridge starting, PIN: %s", pin)

	registry := session.NewRegistry()
	registry.DiscoverExisting() // Discover existing tmux sessions on startup

	// Create attachment token store for WebSocket connections
	tokenStore := auth.NewAttachmentTokenStore()

	// Create ttyd manager and reverse proxy
	ttydManager := ttyd.NewManager(ttyd.Config{})
	ttydProxy := ttyd.NewReverseProxy(ttydManager)

	// Create handlers
	wsHandler := ws.NewHandler(registry, tokenStore)
	apiHandler := api.NewHandler(registry, tokenStore, ttydManager)

	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("static FS error: %v", err)
	}

	mux := http.NewServeMux()

	// HTTP REST API routes
	mux.HandleFunc("/api/auth", apiHandler.HandleAuth)
	mux.HandleFunc("/api/auth/validate", api.AuthMiddleware(apiHandler.HandleValidate))
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[Router] /api/sessions: %s %s", r.Method, r.URL.Path)
		switch r.Method {
		case http.MethodGet:
			api.AuthMiddleware(apiHandler.HandleListSessions)(w, r)
		case http.MethodPost:
			api.AuthMiddleware(apiHandler.HandleCreateSession)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[Router] /api/sessions/: %s %s", r.Method, r.URL.Path)
		// Handle /api/sessions/{id} and /api/sessions/{id}/attach
		if r.Method == http.MethodDelete {
			api.AuthMiddleware(apiHandler.HandleDeleteSession)(w, r)
		} else if r.Method == http.MethodPost {
			api.AuthMiddleware(apiHandler.HandleAttachSession)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ttyd reverse proxy for terminal WebSocket
	mux.Handle("/ttyd/", ttydProxy)

	// WebSocket endpoint (legacy, may be deprecated)
	mux.HandleFunc("/ws", wsHandler.ServeWS)

	// Static files (must be last)
	mux.Handle("/", http.FileServer(http.FS(sub)))

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go registry.Cleanup(10 * time.Minute)

	log.Printf("Listening on %s", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}
