package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config represents the application configuration
type Config struct {
	PIN            string `json:"pin,omitempty"`
	Port           string `json:"port,omitempty"`
	Autocreate     bool   `json:"autocreate"`
	DefaultSession string `json:"default_session,omitempty"`
	DefaultDir     string `json:"default_dir,omitempty"`
}

// RuntimeInfo stores runtime information that can be read by other tools
type RuntimeInfo struct {
	PIN  string `json:"pin"`
	Port string `json:"port"`
	PID  int    `json:"pid"`
}

// DefaultConfigDir returns the default config directory
func DefaultConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp"
	}
	return filepath.Join(home, ".config", "winterm-bridge")
}

// ConfigPath returns the path to the config file
func ConfigPath() string {
	return filepath.Join(DefaultConfigDir(), "config.json")
}

// RuntimeInfoPath returns the path to the runtime info file
func RuntimeInfoPath() string {
	return filepath.Join(DefaultConfigDir(), "runtime.json")
}

// Load loads configuration from file
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

// Save saves configuration to file
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

// WriteRuntimeInfo writes runtime information for other tools to read
func WriteRuntimeInfo(pin, port string) error {
	dir := DefaultConfigDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	info := RuntimeInfo{
		PIN:  pin,
		Port: port,
		PID:  os.Getpid(),
	}

	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(RuntimeInfoPath(), data, 0600)
}

// ReadRuntimeInfo reads runtime information
func ReadRuntimeInfo() (*RuntimeInfo, error) {
	data, err := os.ReadFile(RuntimeInfoPath())
	if err != nil {
		return nil, err
	}

	var info RuntimeInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

// CleanupRuntimeInfo removes the runtime info file
func CleanupRuntimeInfo() {
	os.Remove(RuntimeInfoPath())
}
