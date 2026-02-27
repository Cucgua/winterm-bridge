package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"winterm-bridge/internal/api"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
	"winterm-bridge/internal/monitor"
	"winterm-bridge/internal/pty"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
)

// Version is set at build time via ldflags
var Version = "dev"

//go:embed static/*
var staticFS embed.FS

func main() {
	// Handle -version flag early
	if len(os.Args) > 1 && (os.Args[1] == "-version" || os.Args[1] == "--version") {
		fmt.Println(Version)
		os.Exit(0)
	}

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
	pin := auth.InitPINWithConfig(cfg.PIN, cfg.PINLength)
	log.Printf("WinTerm-Bridge starting, PIN: %s", pin)

	// Ensure tmux config exists in runtime.json (critical for mobile touch support)
	if cfg.Tmux == nil {
		cfg.Tmux = config.DefaultTmuxConfig()
		log.Printf("Initialized default tmux configuration")
	}

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
	registry.DiscoverExisting()       // Discover existing tmux sessions on startup
	registry.LoadPersistentSessions() // Load persistent sessions (creates ghost sessions if needed)

	// Auto-create default session if enabled and no sessions exist
	if *autocreate {
		if err := registry.EnsureDefaultSession(*defaultSession, *defaultDir); err != nil {
			log.Printf("Warning: failed to create default session: %v", err)
		}
	}

	// Create attachment token store for WebSocket connections
	tokenStore := auth.NewAttachmentTokenStore()
	accessManager := auth.NewAccessManager(cfg.PINLength)

	// Create PTY manager and handler
	ptyManager := pty.NewManager(pty.Config{})
	ptyHandler := pty.NewHandler(ptyManager, registry, tokenStore, accessManager)

	// Create AI monitor service (independent of web connections, uses tmux capture-pane)
	monitorAdapter := monitor.NewRegistryAdapter(registry, ptyManager)
	monitorService := monitor.NewService(monitorAdapter)
	ptyHandler.SetUserInputNotifier(monitorService.OnUserInput)
	// Load AI config from file and apply
	if aiCfg := config.GetAIMonitorConfig(); aiCfg != nil {
		monitorService.UpdateConfig(monitor.Config{
			Enabled:     aiCfg.Enabled,
			Endpoint:    aiCfg.Endpoint,
			APIKey:      aiCfg.APIKey,
			Model:       aiCfg.Model,
			Lines:       aiCfg.Lines,
			Interval:    aiCfg.Interval,
			ExtraParams: aiCfg.ExtraParams,
		})
	}

	// Create API handler
	apiHandler := api.NewHandler(registry, tokenStore, accessManager, ptyManager, monitorService)

	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("static FS error: %v", err)
	}

	mux := http.NewServeMux()
	withAuth := func(next http.HandlerFunc) http.HandlerFunc {
		return api.AuthMiddleware(accessManager, next)
	}

	// HTTP REST API routes
	mux.HandleFunc("/api/auth", apiHandler.HandleAuth)
	mux.HandleFunc("/api/auth/validate", withAuth(apiHandler.HandleValidate))
	mux.HandleFunc("/api/auth/guest-pins", withAuth(apiHandler.HandleGuestPins))
	mux.HandleFunc("/api/auth/guest-pins/", withAuth(apiHandler.HandleGuestPinByID))
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			withAuth(apiHandler.HandleListSessions)(w, r)
		case http.MethodPost:
			withAuth(apiHandler.HandleCreateSession)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		// Handle /api/sessions/{id}, /api/sessions/{id}/attach, /api/sessions/{id}/persist,
		// /api/sessions/{id}/notify, /api/sessions/{id}/auto, /api/sessions/{id}/settings,
		// /api/sessions/{id}/files*
		path := r.URL.Path

		// Check if path ends with /persist
		if strings.HasSuffix(path, "/persist") {
			switch r.Method {
			case http.MethodPost:
				withAuth(apiHandler.HandlePersistSession)(w, r)
			case http.MethodDelete:
				withAuth(apiHandler.HandleUnpersistSession)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Check if path ends with /archive
		if strings.HasSuffix(path, "/archive") {
			switch r.Method {
			case http.MethodPost:
				withAuth(apiHandler.HandleArchiveSession)(w, r)
			case http.MethodDelete:
				withAuth(apiHandler.HandleUnarchiveSession)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Handle /api/sessions/{id}/attach
		if strings.HasSuffix(path, "/attach") {
			if r.Method == http.MethodPost {
				withAuth(apiHandler.HandleAttachSession)(w, r)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Handle /api/sessions/{id}/notify
		if strings.HasSuffix(path, "/notify") {
			withAuth(apiHandler.HandleSessionNotify)(w, r)
			return
		}

		// Handle /api/sessions/{id}/goal
		if strings.HasSuffix(path, "/goal") {
			withAuth(apiHandler.HandleSessionGoal)(w, r)
			return
		}

		// Handle /api/sessions/{id}/auto
		if strings.HasSuffix(path, "/auto") {
			withAuth(apiHandler.HandleSessionAuto)(w, r)
			return
		}

		// Handle /api/sessions/{id}/settings
		if strings.HasSuffix(path, "/settings") {
			withAuth(apiHandler.HandleSessionSettings)(w, r)
			return
		}

		// Handle /api/sessions/{id}/git/status
		if strings.HasSuffix(path, "/git/status") {
			withAuth(apiHandler.HandleSessionGitStatus)(w, r)
			return
		}

		// Handle /api/sessions/{id}/git/diff
		if strings.HasSuffix(path, "/git/diff") {
			withAuth(apiHandler.HandleSessionGitDiff)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files/content
		if strings.HasSuffix(path, "/files/content") {
			withAuth(apiHandler.HandleSessionFileContent)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files/dirs
		if strings.HasSuffix(path, "/files/dirs") {
			withAuth(apiHandler.HandleSessionFileDirs)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files/move
		if strings.HasSuffix(path, "/files/move") {
			withAuth(apiHandler.HandleSessionFileMove)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files/upload
		if strings.HasSuffix(path, "/files/upload") {
			withAuth(apiHandler.HandleSessionFileUpload)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files/download
		if strings.HasSuffix(path, "/files/download") {
			withAuth(apiHandler.HandleSessionFileDownload)(w, r)
			return
		}

		// Handle /api/sessions/{id}/files
		if strings.HasSuffix(path, "/files") {
			switch r.Method {
			case http.MethodGet:
				withAuth(apiHandler.HandleSessionFiles)(w, r)
			case http.MethodDelete:
				withAuth(apiHandler.HandleSessionFileDelete)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Handle /api/sessions/{id} (delete)
		if r.Method == http.MethodDelete {
			withAuth(apiHandler.HandleDeleteSession)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebSocket endpoint for terminal
	mux.HandleFunc("/ws", ptyHandler.ServeWS)

	// Font API endpoints (no auth required for loading fonts)
	mux.HandleFunc("/api/fonts", apiHandler.HandleListFonts)
	mux.HandleFunc("/api/fonts/", apiHandler.HandleServeFont)

	// AI monitor API endpoints
	mux.HandleFunc("/api/ai/config", withAuth(apiHandler.HandleAIConfig))
	mux.HandleFunc("/api/ai/test", withAuth(apiHandler.HandleAITest))
	mux.HandleFunc("/api/ai/summaries", withAuth(apiHandler.HandleAISummaries))
	mux.HandleFunc("/api/ai/presets", withAuth(apiHandler.HandleAIPresets))
	mux.HandleFunc("/api/ai/presets/", withAuth(apiHandler.HandleAIPresetAction))

	// Email notification API endpoints
	mux.HandleFunc("/api/email/config", withAuth(apiHandler.HandleEmailConfig))
	mux.HandleFunc("/api/email/test", withAuth(apiHandler.HandleEmailTest))

	// Auto-reply API endpoints
	mux.HandleFunc("/api/auto/config", withAuth(apiHandler.HandleAutoConfig))
	mux.HandleFunc("/api/auto/stop", withAuth(apiHandler.HandleAutoStop))
	mux.HandleFunc("/api/auto/logs", withAuth(apiHandler.HandleAutoLogs))

	// Workflow events API endpoint
	mux.HandleFunc("/api/workflow-events", withAuth(apiHandler.HandleWorkflowEvents))

	// AI request logging API endpoints
	mux.HandleFunc("/api/ai/log-config", withAuth(apiHandler.HandleAILogConfig))
	mux.HandleFunc("/api/ai/logs", withAuth(apiHandler.HandleAILogs))

	// Tmux configuration API endpoint
	mux.HandleFunc("/api/tmux/config", withAuth(apiHandler.HandleTmuxConfig))

	// Upload API endpoints
	mux.HandleFunc("/api/upload", withAuth(apiHandler.HandleUpload))
	mux.HandleFunc("/api/upload/config", withAuth(apiHandler.HandleUploadConfig))
	mux.HandleFunc("/api/upload/files", withAuth(apiHandler.HandleClearUploads))

	// IDE integration API endpoints
	mux.HandleFunc("/api/ide/config", withAuth(apiHandler.HandleIDEConfig))
	mux.HandleFunc("/api/ide/context", withAuth(apiHandler.HandleIDEContext))
	mux.HandleFunc("/api/ide/test", withAuth(apiHandler.HandleIDETest))

	// Static files with SPA fallback (serves index.html for unknown routes)
	mux.Handle("/", spaHandler(http.FS(sub)))

	// CORS middleware for multi-server frontend access
	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "3600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		mux.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              ":" + *port,
		Handler:           corsHandler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go registry.Cleanup(1 * time.Minute)

	// Start upload file cleanup goroutine
	api.StartUploadCleaner(5 * time.Minute)

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
