package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// configMu protects concurrent access to the config file
var configMu sync.Mutex

// PersistentSession represents a session saved for persistence across restarts
type PersistentSession struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	WorkingDir string    `json:"working_dir"`
	CreatedAt  time.Time `json:"created_at"`
}

// AIMonitorConfig holds the AI session monitoring configuration
type AIMonitorConfig struct {
	Enabled  bool   `json:"enabled"`
	Endpoint string `json:"endpoint"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
	Lines    int    `json:"lines"`
	Interval int    `json:"interval"` // seconds
}

// EmailConfig holds the email notification configuration
type EmailConfig struct {
	Enabled     bool   `json:"enabled"`
	SMTPHost    string `json:"smtp_host"`
	SMTPPort    int    `json:"smtp_port"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	FromAddress string `json:"from_address"`
	ToAddress   string `json:"to_address"`
	NotifyDelay int    `json:"notify_delay"` // seconds to wait before sending notification (default 60)
}

// SessionNotifySettings holds per-session notification settings
type SessionNotifySettings struct {
	SessionID     string `json:"session_id"`
	NotifyEnabled bool   `json:"notify_enabled"`
}

// Config represents the unified application configuration stored in runtime.json
// This file serves as both persistent configuration and runtime state
type Config struct {
	// Persistent configuration fields
	PIN            string `json:"pin,omitempty"`
	Port           string `json:"port,omitempty"`
	Autocreate     bool   `json:"autocreate"`
	DefaultSession string `json:"default_session,omitempty"`
	DefaultDir     string `json:"default_dir,omitempty"`

	// Runtime state field (updated on startup, cleared on exit)
	PID int `json:"pid"`

	// Persistent sessions (survive server restarts)
	PersistentSessions []PersistentSession `json:"persistent_sessions,omitempty"`

	// AI monitor configuration
	AIMonitor *AIMonitorConfig `json:"ai_monitor,omitempty"`

	// Email notification configuration
	Email *EmailConfig `json:"email,omitempty"`

	// Per-session notification settings
	SessionNotify []SessionNotifySettings `json:"session_notify,omitempty"`
}

// DefaultConfigDir returns the default config directory
func DefaultConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp"
	}
	return filepath.Join(home, ".config", "winterm-bridge")
}

// ConfigPath returns the path to the unified config file (runtime.json)
func ConfigPath() string {
	return filepath.Join(DefaultConfigDir(), "runtime.json")
}

// Load loads configuration from runtime.json
func Load() (*Config, error) {
	cfg := &Config{
		Port:           "8080",
		Autocreate:     true,
		DefaultSession: "Main",
	}

	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Save saves configuration to runtime.json
func Save(cfg *Config) error {
	dir := DefaultConfigDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(ConfigPath(), data, 0600)
}

// UpdatePID updates the PID field in the config and saves to file
func UpdatePID(pid int) error {
	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.PID = pid
	return Save(cfg)
}

// ClearPID sets PID to 0 (indicating not running) and saves to file
func ClearPID() error {
	cfg, err := Load()
	if err != nil {
		// If file doesn't exist, nothing to clear
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	cfg.PID = 0
	return Save(cfg)
}

// AddPersistentSession adds a session to the persistent sessions list
func AddPersistentSession(ps PersistentSession) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	// Check if already exists, update if so
	for i, existing := range cfg.PersistentSessions {
		if existing.ID == ps.ID {
			cfg.PersistentSessions[i] = ps
			return Save(cfg)
		}
	}

	// Add new persistent session
	cfg.PersistentSessions = append(cfg.PersistentSessions, ps)
	return Save(cfg)
}

// RemovePersistentSession removes a session from the persistent sessions list
func RemovePersistentSession(id string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	// Find and remove
	for i, ps := range cfg.PersistentSessions {
		if ps.ID == id {
			cfg.PersistentSessions = append(cfg.PersistentSessions[:i], cfg.PersistentSessions[i+1:]...)
			return Save(cfg)
		}
	}

	return nil // Not found, nothing to remove
}

// GetPersistentSession returns a persistent session by ID, or nil if not found
func GetPersistentSession(id string) *PersistentSession {
	cfg, err := Load()
	if err != nil {
		return nil
	}

	for _, ps := range cfg.PersistentSessions {
		if ps.ID == id {
			return &ps
		}
	}
	return nil
}

// GetAllPersistentSessions returns all persistent sessions
func GetAllPersistentSessions() []PersistentSession {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	return cfg.PersistentSessions
}

// GetAIMonitorConfig returns the AI monitor configuration
func GetAIMonitorConfig() *AIMonitorConfig {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	return cfg.AIMonitor
}

// SaveAIMonitorConfig saves the AI monitor configuration
func SaveAIMonitorConfig(aiCfg *AIMonitorConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.AIMonitor = aiCfg
	return Save(cfg)
}

// GetEmailConfig returns the email notification configuration
func GetEmailConfig() *EmailConfig {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	return cfg.Email
}

// SaveEmailConfig saves the email notification configuration
func SaveEmailConfig(emailCfg *EmailConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.Email = emailCfg
	return Save(cfg)
}

// GetSessionNotifyEnabled returns whether notification is enabled for a session
func GetSessionNotifyEnabled(sessionID string) bool {
	cfg, err := Load()
	if err != nil {
		return false
	}
	for _, s := range cfg.SessionNotify {
		if s.SessionID == sessionID {
			return s.NotifyEnabled
		}
	}
	return false
}

// SetSessionNotifyEnabled sets the notification enabled status for a session
func SetSessionNotifyEnabled(sessionID string, enabled bool) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	// Find and update or add new entry
	found := false
	for i, s := range cfg.SessionNotify {
		if s.SessionID == sessionID {
			cfg.SessionNotify[i].NotifyEnabled = enabled
			found = true
			break
		}
	}
	if !found {
		cfg.SessionNotify = append(cfg.SessionNotify, SessionNotifySettings{
			SessionID:     sessionID,
			NotifyEnabled: enabled,
		})
	}
	return Save(cfg)
}

// RemoveSessionNotifySettings removes notification settings for a session
func RemoveSessionNotifySettings(sessionID string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	for i, s := range cfg.SessionNotify {
		if s.SessionID == sessionID {
			cfg.SessionNotify = append(cfg.SessionNotify[:i], cfg.SessionNotify[i+1:]...)
			return Save(cfg)
		}
	}
	return nil
}
