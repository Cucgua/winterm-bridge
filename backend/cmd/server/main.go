package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"winterm-bridge/internal/api"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
	"winterm-bridge/internal/pty"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
)

//go:embed static/*
var staticFS embed.FS

func main() {
	// Load config file
	cfg, err := config.Load()
	if err != nil {
		log.Printf("Warning: failed to load config: %v", err)
		cfg = &config.Config{
			Port:           "8080",
			Autocreate:     true,
			DefaultSession: "Main",
		}
	}

	// Parse command line flags (override config file)
	port := flag.String("port", getEnvOrDefault("PORT", cfg.Port, "8080"), "Server port")
	autocreate := flag.Bool("autocreate", cfg.Autocreate, "Auto-create default session on startup")
	defaultSession := flag.String("default-session", getEnvOrDefault("", cfg.DefaultSession, "Main"), "Default session name")
	defaultDir := flag.String("default-dir", getEnvOrDefault("HOME", cfg.DefaultDir, ""), "Default working directory")
	flag.Parse()

	// Check tmux availability
	version, err := tmux.CheckTmuxAvailable()
	if err != nil {
		log.Fatalf("tmux not found: %v", err)
	}
	log.Printf("tmux detected: %s", version)

	// Initialize PIN (priority: env var > config file > random)
	pin := auth.InitPINWithConfig(cfg.PIN)
	log.Printf("WinTerm-Bridge starting, PIN: %s", pin)

	// Update config with current runtime values and save
	cfg.PIN = pin
	cfg.Port = *port
	cfg.PID = os.Getpid()
	if err := config.Save(cfg); err != nil {
		log.Printf("Warning: failed to save config: %v", err)
	}

	// Setup signal handler to clear PID on exit (keep config file)
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		config.ClearPID()
		os.Exit(0)
	}()

	registry := session.NewRegistry()
	registry.DiscoverExisting() // Discover existing tmux sessions on startup

	// Auto-create default session if enabled and no sessions exist
	if *autocreate {
		if err := registry.EnsureDefaultSession(*defaultSession, *defaultDir); err != nil {
			log.Printf("Warning: failed to create default session: %v", err)
		}
	}

	// Create attachment token store for WebSocket connections
	tokenStore := auth.NewAttachmentTokenStore()

	// Create PTY manager and handler
	ptyManager := pty.NewManager(pty.Config{})
	ptyHandler := pty.NewHandler(ptyManager, registry, tokenStore)

	// Create API handler
	apiHandler := api.NewHandler(registry, tokenStore, ptyManager)

	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("static FS error: %v", err)
	}

	mux := http.NewServeMux()

	// HTTP REST API routes
	mux.HandleFunc("/api/auth", apiHandler.HandleAuth)
	mux.HandleFunc("/api/auth/validate", api.AuthMiddleware(apiHandler.HandleValidate))
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
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
		// Handle /api/sessions/{id} and /api/sessions/{id}/attach
		if r.Method == http.MethodDelete {
			api.AuthMiddleware(apiHandler.HandleDeleteSession)(w, r)
		} else if r.Method == http.MethodPost {
			api.AuthMiddleware(apiHandler.HandleAttachSession)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebSocket endpoint for terminal
	mux.HandleFunc("/ws", ptyHandler.ServeWS)

	// Static files with SPA fallback (serves index.html for unknown routes)
	mux.Handle("/", spaHandler(http.FS(sub)))

	srv := &http.Server{
		Addr:              ":" + *port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go registry.Cleanup(1 * time.Minute)

	log.Printf("Listening on %s", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}

// getEnvOrDefault returns env value, then config value, then default value
func getEnvOrDefault(envKey, configValue, defaultValue string) string {
	if envKey != "" {
		if value := os.Getenv(envKey); value != "" {
			return value
		}
	}
	if configValue != "" {
		return configValue
	}
	return defaultValue
}

// spaHandler wraps http.FileServer with SPA fallback support
// If a file is not found, it serves index.html instead
func spaHandler(fsys http.FileSystem) http.Handler {
	fileServer := http.FileServer(fsys)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Try to open the file
		f, err := fsys.Open(path)
		if err != nil {
			// File not found, serve index.html for SPA routing
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()

		// Check if it's a directory without trailing slash
		stat, err := fsys.Open(path)
		if err == nil {
			defer stat.Close()
			if info, err := stat.Stat(); err == nil && info.IsDir() {
				// Check if index.html exists in the directory
				indexPath := path + "/index.html"
				if idx, err := fsys.Open(indexPath); err != nil {
					// No index.html in directory, serve root index.html
					r.URL.Path = "/"
					fileServer.ServeHTTP(w, r)
					return
				} else {
					idx.Close()
				}
			}
		}

		// Serve the file normally
		fileServer.ServeHTTP(w, r)
	})
}
