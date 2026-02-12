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
	IsArchived bool      `json:"is_archived,omitempty"` // 归档状态：从左侧栏隐藏但保留在会话选择页
}

// AIMonitorConfig holds the AI session monitoring configuration
type AIMonitorConfig struct {
	Enabled     bool   `json:"enabled"`
	Endpoint    string `json:"endpoint"`
	APIKey      string `json:"api_key"`
	Model       string `json:"model"`
	Lines       int    `json:"lines"`
	Interval    int    `json:"interval"`     // seconds
	ExtraParams string `json:"extra_params"` // JSON string for custom API parameters (e.g., {"max_tokens": 2000})
}

// EmailConfig holds the email notification configuration
type EmailConfig struct {
	Enabled     bool     `json:"enabled"`
	SMTPHost    string   `json:"smtp_host"`
	SMTPPort    int      `json:"smtp_port"`
	Username    string   `json:"username"`
	Password    string   `json:"password"`
	FromAddress string   `json:"from_address"`
	ToAddress   string   `json:"to_address"`
	NotifyDelay int      `json:"notify_delay"`           // seconds to wait before sending notification (default 60)
	NotifyTags  []string `json:"notify_tags,omitempty"`  // tags that trigger notifications, empty = default set
}

// SessionNotifySettings holds per-session notification settings
type SessionNotifySettings struct {
	SessionID     string `json:"session_id"`
	NotifyEnabled bool   `json:"notify_enabled"`
}

// SessionAutoSettings holds per-session auto-reply settings
type SessionAutoSettings struct {
	SessionID   string `json:"session_id"`
	AutoEnabled bool   `json:"auto_enabled"`
	Goal        string `json:"goal,omitempty"` // 会话级目标
}

// AutoConfig holds the auto-reply configuration (global settings, per-session enable)
type AutoConfig struct {
	Model         string   `json:"model"`           // Decision model, empty = use AI Monitor model
	ContextLines  int      `json:"context_lines"`   // Default 150
	ConfidenceMin float64  `json:"confidence_min"`  // Default 0.7
	CooldownMs    int      `json:"cooldown_ms"`     // Default 3000
	Goal          string   `json:"goal"`            // User-defined strategy direction
	AllowTags     []string `json:"allow_tags"`      // ["需确认", "需选择"]
	DenyKeywords  []string `json:"deny_keywords"`   // ["rm", "delete", "format", "sudo"]
	ExtraParams   string   `json:"extra_params"`    // JSON string for custom API parameters (independent from AI Monitor)
	SafetyLevel   string   `json:"safety_level"`    // "strict", "standard", "loose" - controls validation strictness
}

// TmuxConfig holds the tmux terminal configuration
type TmuxConfig struct {
	// Common settings (常用设置)
	Mouse           bool   `json:"mouse"`             // set -g mouse on/off
	SetClipboard    bool   `json:"set_clipboard"`     // set -s set-clipboard on/off
	SetTitles       bool   `json:"set_titles"`        // set -g set-titles on/off
	SetTitlesString string `json:"set_titles_string"` // set -g set-titles-string (e.g., "#S:#W")
	Status          bool   `json:"status"`            // set -g status on/off
	RightClickMenu  bool   `json:"right_click_menu"`  // bind/unbind MouseDown3Pane

	// Advanced settings (高级设置)
	HistoryLimit     int  `json:"history_limit"`      // set -g history-limit (1000-100000)
	EscapeTime       int  `json:"escape_time"`        // set -s escape-time (0-50ms)
	ScrollSpeed      int  `json:"scroll_speed"`       // WheelUp/Down -N (1-10)
	AggressiveResize bool `json:"aggressive_resize"`  // setw -g aggressive-resize on/off
	FocusEvents      bool `json:"focus_events"`       // set -g focus-events on/off (for vim integration)
	BaseIndex        int  `json:"base_index"`         // set -g base-index (0 or 1)
	PaneBaseIndex    int  `json:"pane_base_index"`    // setw -g pane-base-index (0 or 1)
	RenumberWindows  bool `json:"renumber_windows"`   // set -g renumber-windows on/off
	VisualActivity   bool `json:"visual_activity"`    // set -g visual-activity on/off
	VisualBell       bool `json:"visual_bell"`        // set -g visual-bell on/off
	MonitorActivity  bool `json:"monitor_activity"`   // setw -g monitor-activity on/off
}

// IDEConfig holds the IDE integration configuration
type IDEConfig struct {
	Enabled      bool     `json:"enabled"`
	Endpoint     string   `json:"endpoint"`      // Default "http://localhost:63888"
	PollInterval int      `json:"poll_interval"`  // seconds, default 5
	ShowFields   []string `json:"show_fields"`    // ["project", "openFiles", "currentFunction"]
	CopyTemplate string   `json:"copy_template"`  // format template with {project.name}, {project.basePath}, etc.
}

// UploadConfig holds the image upload configuration
type UploadConfig struct {
	Enabled    bool   `json:"enabled"`
	Dir        string `json:"dir"`
	TTLMinutes int    `json:"ttl_minutes"`
	MaxSizeMB  int    `json:"max_size_mb"`
}

// AIPreset represents a named snapshot of AI Monitor + Auto-Reply configuration
type AIPreset struct {
	Name      string           `json:"name"`
	AIMonitor *AIMonitorConfig `json:"ai_monitor"`
	AIAuto    *AutoConfig      `json:"ai_auto"`
	CreatedAt int64            `json:"created_at"`
}

// Config represents the unified application configuration stored in runtime.json
// This file serves as both persistent configuration and runtime state
type Config struct {
	// Persistent configuration fields
	PIN            string `json:"pin,omitempty"`
	PINLength      int    `json:"pin_length,omitempty"` // PIN length for generation (6-12, default 6)
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

	// Per-session auto-reply settings
	SessionAuto []SessionAutoSettings `json:"session_auto,omitempty"`

	// Auto-reply configuration
	AIAuto *AutoConfig `json:"ai_auto,omitempty"`

	// Tmux terminal configuration
	Tmux *TmuxConfig `json:"tmux,omitempty"`

	// Upload configuration
	Upload *UploadConfig `json:"upload,omitempty"`

	// IDE integration configuration
	IDE *IDEConfig `json:"ide,omitempty"`

	// AI configuration presets
	AIPresets []AIPreset `json:"ai_presets,omitempty"`

	// AI request logging
	AILogEnabled bool `json:"ai_log_enabled,omitempty"`
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
		PINLength:      6,
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

// SetSessionArchived sets the archived status of a persistent session
func SetSessionArchived(sessionID string, archived bool) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	for i, ps := range cfg.PersistentSessions {
		if ps.ID == sessionID {
			cfg.PersistentSessions[i].IsArchived = archived
			return Save(cfg)
		}
	}
	return nil // Not found, nothing to update
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

// DefaultAutoConfig returns the default auto-reply configuration
func DefaultAutoConfig() *AutoConfig {
	return &AutoConfig{
		Model:         "",
		ContextLines:  150,
		ConfidenceMin: 0.7,
		CooldownMs:    3000,
		Goal:          "",
		AllowTags:     []string{"需确认", "需选择"},
		DenyKeywords:  []string{"rm", "delete", "format", "sudo"},
		SafetyLevel:   "standard", // Default to balanced safety/usability
	}
}

// GetAutoConfig returns the auto-reply configuration
func GetAutoConfig() *AutoConfig {
	cfg, err := Load()
	if err != nil {
		return DefaultAutoConfig()
	}
	if cfg.AIAuto == nil {
		return DefaultAutoConfig()
	}
	return cfg.AIAuto
}

// SaveAutoConfig saves the auto-reply configuration
func SaveAutoConfig(autoCfg *AutoConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.AIAuto = autoCfg
	return Save(cfg)
}

// GetSessionAutoEnabled returns whether auto-reply is enabled for a session
func GetSessionAutoEnabled(sessionID string) bool {
	cfg, err := Load()
	if err != nil {
		return false
	}
	for _, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			return s.AutoEnabled
		}
	}
	return false
}

// SetSessionAutoEnabled sets the auto-reply enabled status for a session
func SetSessionAutoEnabled(sessionID string, enabled bool) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	// Find and update or add new entry
	found := false
	for i, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			cfg.SessionAuto[i].AutoEnabled = enabled
			found = true
			break
		}
	}
	if !found {
		cfg.SessionAuto = append(cfg.SessionAuto, SessionAutoSettings{
			SessionID:   sessionID,
			AutoEnabled: enabled,
		})
	}
	return Save(cfg)
}

// GetSessionAutoGoal returns the goal for a session
func GetSessionAutoGoal(sessionID string) string {
	cfg, err := Load()
	if err != nil {
		return ""
	}
	for _, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			return s.Goal
		}
	}
	return ""
}

// SetSessionAutoGoal updates the goal for a session
func SetSessionAutoGoal(sessionID string, goal string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	found := false
	for i, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			cfg.SessionAuto[i].Goal = goal
			found = true
			break
		}
	}
	if !found {
		cfg.SessionAuto = append(cfg.SessionAuto, SessionAutoSettings{
			SessionID: sessionID,
			Goal:      goal,
		})
	}
	return Save(cfg)
}

// SetSessionAutoWithGoal sets the auto-reply enabled status and goal for a session
func SetSessionAutoWithGoal(sessionID string, enabled bool, goal string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	found := false
	for i, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			cfg.SessionAuto[i].AutoEnabled = enabled
			cfg.SessionAuto[i].Goal = goal
			found = true
			break
		}
	}
	if !found {
		cfg.SessionAuto = append(cfg.SessionAuto, SessionAutoSettings{
			SessionID:   sessionID,
			AutoEnabled: enabled,
			Goal:        goal,
		})
	}
	return Save(cfg)
}

// RemoveSessionAutoSettings removes auto-reply settings for a session
func RemoveSessionAutoSettings(sessionID string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	for i, s := range cfg.SessionAuto {
		if s.SessionID == sessionID {
			cfg.SessionAuto = append(cfg.SessionAuto[:i], cfg.SessionAuto[i+1:]...)
			return Save(cfg)
		}
	}
	return nil
}

// GetAllSessionAutoEnabled returns all session IDs with auto-reply enabled
func GetAllSessionAutoEnabled() []string {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	var result []string
	for _, s := range cfg.SessionAuto {
		if s.AutoEnabled {
			result = append(result, s.SessionID)
		}
	}
	return result
}

// GetAILogEnabled returns whether AI request logging is enabled
func GetAILogEnabled() bool {
	cfg, err := Load()
	if err != nil {
		return false
	}
	return cfg.AILogEnabled
}

// SetAILogEnabled sets whether AI request logging is enabled
func SetAILogEnabled(enabled bool) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.AILogEnabled = enabled
	return Save(cfg)
}

// AILogDir returns the directory for AI request logs
func AILogDir() string {
	return filepath.Join(DefaultConfigDir(), "ai_logs")
}

// DefaultTmuxConfig returns the default tmux configuration
func DefaultTmuxConfig() *TmuxConfig {
	return &TmuxConfig{
		// Common settings
		Mouse:           true,
		SetClipboard:    true,
		SetTitles:       true,
		SetTitlesString: "#S:#W",
		Status:          true,
		RightClickMenu:  false,
		// Advanced settings
		HistoryLimit:     50000,
		EscapeTime:       0,
		ScrollSpeed:      2,
		AggressiveResize: true,
		FocusEvents:      true,
		BaseIndex:        0,
		PaneBaseIndex:    0,
		RenumberWindows:  false,
		VisualActivity:   false,
		VisualBell:       false,
		MonitorActivity:  false,
	}
}

// GetTmuxConfig returns the tmux configuration
func GetTmuxConfig() *TmuxConfig {
	cfg, err := Load()
	if err != nil {
		return DefaultTmuxConfig()
	}
	if cfg.Tmux == nil {
		return DefaultTmuxConfig()
	}
	return cfg.Tmux
}

// SaveTmuxConfig saves the tmux configuration
func SaveTmuxConfig(tmuxCfg *TmuxConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.Tmux = tmuxCfg
	return Save(cfg)
}

// DefaultUploadConfig returns the default upload configuration
func DefaultUploadConfig() *UploadConfig {
	return &UploadConfig{
		Enabled:    true,
		Dir:        filepath.Join(DefaultConfigDir(), "uploads"),
		TTLMinutes: 60,
		MaxSizeMB:  10,
	}
}

// GetUploadConfig returns the upload configuration
func GetUploadConfig() *UploadConfig {
	cfg, err := Load()
	if err != nil {
		return DefaultUploadConfig()
	}
	if cfg.Upload == nil {
		return DefaultUploadConfig()
	}
	return cfg.Upload
}

// SaveUploadConfig saves the upload configuration
func SaveUploadConfig(uploadCfg *UploadConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.Upload = uploadCfg
	return Save(cfg)
}

// DefaultIDEConfig returns the default IDE integration configuration
func DefaultIDEConfig() *IDEConfig {
	return &IDEConfig{
		Enabled:      false,
		Endpoint:     "http://localhost:63888",
		PollInterval: 5,
		ShowFields:   []string{"project", "openFiles", "currentFunction"},
		CopyTemplate: "Project: {project.name}\nPath: {project.basePath}\nFile: {currentFile}\nFunction: {currentFunction.signature}",
	}
}

// GetIDEConfig returns the IDE integration configuration
func GetIDEConfig() *IDEConfig {
	cfg, err := Load()
	if err != nil {
		return DefaultIDEConfig()
	}
	if cfg.IDE == nil {
		return DefaultIDEConfig()
	}
	return cfg.IDE
}

// SaveIDEConfig saves the IDE integration configuration
func SaveIDEConfig(ideCfg *IDEConfig) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}
	cfg.IDE = ideCfg
	return Save(cfg)
}

// GetAIPresets returns all AI configuration presets
func GetAIPresets() []AIPreset {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	return cfg.AIPresets
}

// GetAIPreset returns a single preset by name, or nil if not found
func GetAIPreset(name string) *AIPreset {
	cfg, err := Load()
	if err != nil {
		return nil
	}
	for _, p := range cfg.AIPresets {
		if p.Name == name {
			return &p
		}
	}
	return nil
}

// SaveAIPreset saves an AI preset (upsert by name)
func SaveAIPreset(preset AIPreset) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	// Update existing or append
	found := false
	for i, p := range cfg.AIPresets {
		if p.Name == preset.Name {
			cfg.AIPresets[i] = preset
			found = true
			break
		}
	}
	if !found {
		cfg.AIPresets = append(cfg.AIPresets, preset)
	}
	return Save(cfg)
}

// DeleteAIPreset removes an AI preset by name
func DeleteAIPreset(name string) error {
	configMu.Lock()
	defer configMu.Unlock()

	cfg, err := Load()
	if err != nil {
		return err
	}

	for i, p := range cfg.AIPresets {
		if p.Name == name {
			cfg.AIPresets = append(cfg.AIPresets[:i], cfg.AIPresets[i+1:]...)
			return Save(cfg)
		}
	}
	return nil
}
