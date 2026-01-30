package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

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
