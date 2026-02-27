package tmux

import (
	"fmt"
	"os/exec"
	"strconv"

	"winterm-bridge/internal/config"
)

// ApplyResult contains the result of applying tmux configuration
type ApplyResult struct {
	Applied  bool     `json:"applied"`
	Warnings []string `json:"warnings,omitempty"`
}

// boolToOnOff converts a boolean to tmux "on" or "off" string
func boolToOnOff(b bool) string {
	if b {
		return "on"
	}
	return "off"
}

// ApplyConfig applies tmux configuration to all winterm sessions
func ApplyConfig(cfg *config.TmuxConfig) (*ApplyResult, error) {
	result := &ApplyResult{
		Applied:  true,
		Warnings: []string{},
	}

	sessions, err := ListSessions()
	if err != nil {
		// No sessions is not an error, just nothing to apply to
		sessions = []string{}
	}

	// Get current config to detect history-limit reduction
	currentCfg := config.GetTmuxConfig()

	// Server-level options (apply once, affects all sessions)
	applyServerOptions(cfg)

	// Check for history-limit reduction warning
	if cfg.HistoryLimit < currentCfg.HistoryLimit {
		result.Warnings = append(result.Warnings, "Reducing history-limit may truncate existing buffer content")
	}

	// Apply session-level options to each winterm session
	for _, session := range sessions {
		if err := ApplyToSession(session, cfg); err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to apply to session %s: %v", session, err))
		}
	}

	return result, nil
}

// ApplyToSession applies tmux configuration to a specific session
func ApplyToSession(sessionName string, cfg *config.TmuxConfig) error {
	var errs []error

	// Mouse mode (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "mouse", boolToOnOff(cfg.Mouse)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("mouse: %w", err))
	}

	// Window titles (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "set-titles", boolToOnOff(cfg.SetTitles)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("set-titles: %w", err))
	}

	// Title string format (session-level)
	if cfg.SetTitlesString != "" {
		if err := exec.Command("tmux", "set-option", "-t", sessionName, "set-titles-string", cfg.SetTitlesString).Run(); err != nil {
			errs = append(errs, fmt.Errorf("set-titles-string: %w", err))
		}
	}

	// Status bar (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "status", boolToOnOff(cfg.Status)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("status: %w", err))
	}

	// History limit (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "history-limit", strconv.Itoa(cfg.HistoryLimit)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("history-limit: %w", err))
	}

	// Base index (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "base-index", strconv.Itoa(cfg.BaseIndex)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("base-index: %w", err))
	}

	// Renumber windows (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "renumber-windows", boolToOnOff(cfg.RenumberWindows)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("renumber-windows: %w", err))
	}

	// Visual activity (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "visual-activity", boolToOnOff(cfg.VisualActivity)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("visual-activity: %w", err))
	}

	// Visual bell (session-level)
	if err := exec.Command("tmux", "set-option", "-t", sessionName, "visual-bell", boolToOnOff(cfg.VisualBell)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("visual-bell: %w", err))
	}

	// Aggressive resize (window-level, use setw)
	if err := exec.Command("tmux", "set-window-option", "-t", sessionName, "aggressive-resize", boolToOnOff(cfg.AggressiveResize)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("aggressive-resize: %w", err))
	}

	// Pane base index (window-level)
	if err := exec.Command("tmux", "set-window-option", "-t", sessionName, "pane-base-index", strconv.Itoa(cfg.PaneBaseIndex)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("pane-base-index: %w", err))
	}

	// Monitor activity (window-level)
	if err := exec.Command("tmux", "set-window-option", "-t", sessionName, "monitor-activity", boolToOnOff(cfg.MonitorActivity)).Run(); err != nil {
		errs = append(errs, fmt.Errorf("monitor-activity: %w", err))
	}

	// Scroll speed - rebind wheel up/down in copy-mode
	scrollN := strconv.Itoa(cfg.ScrollSpeed)

	// Unbind and rebind scroll keys for copy-mode
	exec.Command("tmux", "bind-key", "-T", "copy-mode", "WheelUpPane", "send-keys", "-N", scrollN, "-X", "scroll-up").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode", "WheelDownPane", "send-keys", "-N", scrollN, "-X", "scroll-down").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode-vi", "WheelUpPane", "send-keys", "-N", scrollN, "-X", "scroll-up").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode-vi", "WheelDownPane", "send-keys", "-N", scrollN, "-X", "scroll-down").Run()

	if len(errs) > 0 {
		return fmt.Errorf("multiple errors: %v", errs)
	}
	return nil
}

// applyServerOptions applies server-level tmux options that affect all sessions.
// These only need to be set once per tmux server instance.
func applyServerOptions(cfg *config.TmuxConfig) {
	// set-clipboard is server-level (-s flag)
	exec.Command("tmux", "set-option", "-s", "set-clipboard", boolToOnOff(cfg.SetClipboard)).Run()

	// escape-time is server-level (-s flag)
	exec.Command("tmux", "set-option", "-s", "escape-time", strconv.Itoa(cfg.EscapeTime)).Run()

	// focus-events is server-level (-s flag)
	exec.Command("tmux", "set-option", "-s", "focus-events", boolToOnOff(cfg.FocusEvents)).Run()

	// Right-click menu binding (global)
	if cfg.RightClickMenu {
		exec.Command("tmux", "bind-key", "-n", "MouseDown3Pane", "display-menu", "-T", "#[align=centre]#{pane_index}", "-x", "M", "-y", "M").Run()
	} else {
		exec.Command("tmux", "unbind-key", "-n", "MouseDown3Pane").Run()
	}
}

// ApplyToNewSession applies tmux configuration when creating a new session.
// This applies both server-level and session-level options to ensure the
// session is fully configured (critical for mobile touch/mouse support).
func ApplyToNewSession(sessionName string) error {
	cfg := config.GetTmuxConfig()
	applyServerOptions(cfg)
	return ApplyToSession(sessionName, cfg)
}
