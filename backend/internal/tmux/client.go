package tmux

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
)

// Client represents an independent tmux client connection using control mode
type Client struct {
	SessionName string
	ClientID    string
	Cols        int
	Rows        int

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	mu     sync.Mutex
	closed bool
}

// NewClient creates a new tmux client and attaches to the specified session
// Uses tmux control mode (-C) for programmatic control
func NewClient(sessionName, clientID string, cols, rows int) (*Client, error) {
	// tmux -C uses a different command format - no extra args to attach
	cmd := exec.Command("tmux", "-C", "attach", "-t", sessionName)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start tmux client: %w", err)
	}

	client := &Client{
		SessionName: sessionName,
		ClientID:    clientID,
		Cols:        cols,
		Rows:        rows,
		cmd:         cmd,
		stdin:       stdin,
		stdout:      stdout,
	}

	// Set initial window size after attaching
	resizeCmd := fmt.Sprintf("refresh-client -C %d,%d\n", cols, rows)
	if _, err := stdin.Write([]byte(resizeCmd)); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to set initial size: %w", err)
	}

	return client, nil
}

// SendKeys sends user input to tmux
// Handles control characters properly by using send-keys -H (hex) for raw bytes
func (c *Client) SendKeys(data string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	// Check if data contains any control characters (< 0x20 or 0x7f)
	hasControl := false
	for i := 0; i < len(data); i++ {
		if data[i] < 0x20 || data[i] == 0x7f {
			hasControl = true
			break
		}
	}

	var cmd string
	if hasControl {
		// Use send-keys -H to send raw hex bytes
		// This properly handles control characters like Backspace (0x7f), Ctrl+C (0x03), etc.
		hexBytes := make([]string, 0, len(data))
		for i := 0; i < len(data); i++ {
			hexBytes = append(hexBytes, fmt.Sprintf("%02x", data[i]))
		}
		cmd = fmt.Sprintf("send-keys -H %s\n", strings.Join(hexBytes, " "))
	} else {
		// For plain text, use -l for literal input
		cmd = fmt.Sprintf("send-keys -l %q\n", data)
	}

	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// SendSpecialKey sends special keys (Enter, Tab, etc.) to tmux
func (c *Client) SendSpecialKey(key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	cmd := fmt.Sprintf("send-keys %s\n", key)
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// Resize changes the window size for this client
func (c *Client) Resize(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	c.Cols = cols
	c.Rows = rows

	// tmux control mode: refresh-client -C <cols>,<rows>
	cmd := fmt.Sprintf("refresh-client -C %d,%d\n", cols, rows)
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// ReadOutput reads tmux output (should be called in a goroutine)
// onData callback receives terminal data
// Handles both %output messages and %begin/%end command output blocks
func (c *Client) ReadOutput(onData func([]byte)) error {
	scanner := bufio.NewScanner(c.stdout)

	// State for %begin/%end block parsing
	inBlock := false
	var blockLines []string

	for scanner.Scan() {
		line := scanner.Text()

		// Parse tmux control mode output format
		// %output <pane_id> <data>
		if strings.HasPrefix(line, "%output ") {
			parts := strings.SplitN(line, " ", 3)
			if len(parts) < 3 {
				continue
			}

			// tmux control mode uses C-style escape sequences
			// Need to decode \ooo (octal) and \\ (backslash)
			data := unescapeTmuxOutput(parts[2])
			onData(data)
			continue
		}

		// Handle %begin/%end blocks (command output like capture-pane)
		if strings.HasPrefix(line, "%begin ") {
			inBlock = true
			blockLines = nil
			continue
		}

		if strings.HasPrefix(line, "%end ") {
			if inBlock && len(blockLines) > 0 {
				// Join block lines and send as output
				// Add newlines between lines since they were stripped by scanner
				output := strings.Join(blockLines, "\n")
				if len(output) > 0 {
					onData([]byte(output + "\n"))
				}
			}
			inBlock = false
			blockLines = nil
			continue
		}

		if strings.HasPrefix(line, "%error ") {
			// Command error, reset block state
			inBlock = false
			blockLines = nil
			continue
		}

		if inBlock {
			// Collect lines inside %begin/%end block
			blockLines = append(blockLines, line)
			continue
		}

		// Other message types (%layout-change, %session-changed, etc.) are ignored
	}

	return scanner.Err()
}

// CapturePane captures the current visible pane content
// This sends the content through the onData callback in ReadOutput
func (c *Client) CapturePane() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	// capture-pane -e -p:
	// -e: include escape sequences (ANSI codes for colors, etc.)
	// -p: print to stdout (goes through %begin/%end in control mode)
	cmd := "capture-pane -e -p\n"
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// CapturePaneWithJoin captures pane content with soft wraps joined into logical lines
// This is critical for cross-size rendering to avoid "scrambled" history display
func (c *Client) CapturePaneWithJoin() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	// capture-pane -e -p -J:
	// -e: include escape sequences (ANSI codes for colors, etc.)
	// -p: print to stdout (goes through %begin/%end in control mode)
	// -J: join wrapped lines (critical for cross-size rendering)
	cmd := "capture-pane -e -p -J\n"
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// unescapeTmuxOutput decodes tmux control mode escape sequences
// tmux uses C-style escapes: \ooo for octal, \\ for backslash
func unescapeTmuxOutput(s string) []byte {
	result := make([]byte, 0, len(s))
	i := 0
	for i < len(s) {
		if s[i] == '\\' && i+1 < len(s) {
			// Check for octal escape \ooo (3 octal digits)
			if i+3 < len(s) && isOctalDigit(s[i+1]) && isOctalDigit(s[i+2]) && isOctalDigit(s[i+3]) {
				val := (int(s[i+1]-'0') << 6) | (int(s[i+2]-'0') << 3) | int(s[i+3]-'0')
				result = append(result, byte(val))
				i += 4
				continue
			}
			// Check for escaped backslash
			if s[i+1] == '\\' {
				result = append(result, '\\')
				i += 2
				continue
			}
		}
		result = append(result, s[i])
		i++
	}
	return result
}

func isOctalDigit(c byte) bool {
	return c >= '0' && c <= '7'
}

// Close closes the client connection
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil
	}

	c.closed = true

	// Send detach command
	c.stdin.Write([]byte("detach-client\n"))
	c.stdin.Close()

	return c.cmd.Wait()
}

// CreateSession creates a new tmux session
func CreateSession(name, title, workingDir string) error {
	// tmux new-session -d -s <name> -n <title> [-c <workingDir>]
	// -d: detached (run in background)
	// -s: session name
	// -n: window name
	// -c: working directory
	args := []string{"new-session", "-d", "-s", name, "-n", title}
	if workingDir != "" {
		args = append(args, "-c", workingDir)
	}
	cmd := exec.Command("tmux", args...)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Set window-size to latest so pane resizes to match the most recently active client
	// This ensures each client sees content formatted for their terminal size
	setOpt := exec.Command("tmux", "set-option", "-t", name, "window-size", "latest")
	_ = setOpt.Run()

	// Hide tmux status bar for cleaner UI
	setStatus := exec.Command("tmux", "set-option", "-t", name, "status", "off")
	_ = setStatus.Run()

	// Note: mouse mode is not enabled because tmux control mode (-C) cannot
	// receive mouse events through send-keys. Scrolling is handled locally
	// by xterm.js scrollback instead.

	return nil
}

// EnsureMouseOn enables mouse mode for a tmux session
// Note: This is currently unused because tmux control mode doesn't support mouse events
func EnsureMouseOn(sessionName string) error {
	cmd := exec.Command("tmux", "set-option", "-t", sessionName, "mouse", "on")
	return cmd.Run()
}

// EnsureStatusOff hides the tmux status bar for a session
func EnsureStatusOff(sessionName string) error {
	cmd := exec.Command("tmux", "set-option", "-t", sessionName, "status", "off")
	return cmd.Run()
}

// KillSession destroys a tmux session
func KillSession(name string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	return cmd.Run()
}

// CheckTmuxAvailable checks if tmux is installed and returns version
func CheckTmuxAvailable() (string, error) {
	cmd := exec.Command("tmux", "-V")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("tmux not found: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

// SessionPrefix is the prefix for winterm-managed tmux sessions
const SessionPrefix = "winterm-"

// ListSessions returns all winterm-* tmux sessions
func ListSessions() ([]string, error) {
	cmd := exec.Command("tmux", "list-sessions", "-F", "#{session_name}")
	output, err := cmd.Output()
	if err != nil {
		// No sessions exist
		return nil, nil
	}

	var sessions []string
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if strings.HasPrefix(line, SessionPrefix) {
			sessions = append(sessions, line)
		}
	}
	return sessions, nil
}

// GetCurrentPath returns the current working directory of the active pane in a session
func GetCurrentPath(sessionName string) (string, error) {
	// Use list-panes to get the current path of the active pane
	// Format: #{pane_active} #{pane_current_path}
	cmd := exec.Command("tmux", "list-panes", "-t", sessionName, "-F", "#{pane_active} #{pane_current_path}")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get pane info: %w", err)
	}

	// Find the active pane (pane_active == 1)
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 && parts[0] == "1" {
			return parts[1], nil
		}
	}

	return "", nil
}

// SessionExists checks if a tmux session with the given name exists
func SessionExists(sessionName string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", sessionName)
	return cmd.Run() == nil
}
