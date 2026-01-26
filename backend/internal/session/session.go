package session

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/tmux"
)

type SessionState int

const (
	SessionActive SessionState = iota
	SessionDetached
	SessionTerminated
)

// Client represents a connected WebSocket client with its own tmux client
type Client struct {
	WS         *websocket.Conn
	SendCh     chan []byte
	TmuxClient *tmux.Client // Each client has its own tmux control mode client
}

// Session represents a terminal session backed by a tmux session
// Multiple WebSocket clients can connect with synchronized window sizes
type Session struct {
	ID         string
	TmuxName   string // tmux session name (e.g., winterm-abc123)
	State      SessionState
	CreatedAt  time.Time
	LastActive time.Time
	Clients    map[*websocket.Conn]*Client // Multiple clients can view/interact
	Token      string
	Title      string

	// Sync render mode: all clients share the same size from the master
	MasterWS   *websocket.Conn // Current master client (last resize/input)
	ActiveCols int             // Unified column count
	ActiveRows int             // Unified row count
	ResizeSeq  uint64          // Incrementing sequence number (anti-loop)

	mu sync.Mutex
}

// NewSession creates a new session with the given tmux session name
func NewSession(id, tmuxName string) *Session {
	return &Session{
		ID:         id,
		TmuxName:   tmuxName,
		State:      SessionActive,
		CreatedAt:  time.Now(),
		LastActive: time.Now(),
		Clients:    make(map[*websocket.Conn]*Client),
	}
}

func (s *Session) Touch() {
	s.mu.Lock()
	s.LastActive = time.Now()
	s.mu.Unlock()
}

func (s *Session) Snapshot() (SessionState, time.Time, time.Time, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.State, s.CreatedAt, s.LastActive, s.Title
}

func (s *Session) SetTitle(title string) {
	s.mu.Lock()
	s.Title = title
	s.mu.Unlock()
}

// AddClient adds a new WebSocket client to the session
func (s *Session) AddClient(ws *websocket.Conn, sendCh chan []byte) *Client {
	s.mu.Lock()
	defer s.mu.Unlock()

	client := &Client{
		WS:     ws,
		SendCh: sendCh,
	}
	s.Clients[ws] = client
	s.State = SessionActive
	s.LastActive = time.Now()
	return client
}

// RemoveClient removes a WebSocket client from the session
func (s *Session) RemoveClient(ws *websocket.Conn) {
	var tmuxClientToClose *tmux.Client

	s.mu.Lock()
	if client, ok := s.Clients[ws]; ok {
		// Save tmux client to close AFTER releasing lock
		tmuxClientToClose = client.TmuxClient
		delete(s.Clients, ws)
	}

	if len(s.Clients) == 0 {
		s.State = SessionDetached
		s.LastActive = time.Now()
	}
	s.mu.Unlock()

	// Close tmux client AFTER releasing lock to avoid deadlock
	if tmuxClientToClose != nil {
		_ = tmuxClientToClose.Close()
	}
}

// ClientCount returns the number of connected clients
func (s *Session) ClientCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.Clients)
}

// AttachTmuxClient creates a tmux control mode client for this WebSocket connection
// Each client gets its own independent tmux client with its own window size
func (s *Session) AttachTmuxClient(ws *websocket.Conn, cols, rows int) (*tmux.Client, error) {
	s.mu.Lock()
	client, ok := s.Clients[ws]
	if !ok {
		s.mu.Unlock()
		return nil, nil // Client not registered yet
	}

	if client.TmuxClient != nil {
		tc := client.TmuxClient
		s.mu.Unlock()
		return tc, nil // Already attached
	}

	// Get values needed for tmux client creation
	tmuxName := s.TmuxName
	clientID := ws.RemoteAddr().String()
	s.mu.Unlock()

	// Create tmux control mode client OUTSIDE the lock to avoid blocking
	tmuxClient, err := tmux.NewClient(tmuxName, clientID, cols, rows)
	if err != nil {
		return nil, err
	}

	// Re-acquire lock to update the client
	s.mu.Lock()
	// Check if client still exists (might have been removed while we were creating tmux client)
	client, ok = s.Clients[ws]
	if !ok {
		s.mu.Unlock()
		// Client was removed, close the tmux client we just created
		_ = tmuxClient.Close()
		return nil, nil
	}

	// Check if another goroutine already attached (race condition)
	if client.TmuxClient != nil {
		s.mu.Unlock()
		// Another goroutine already attached, close our client and return theirs
		_ = tmuxClient.Close()
		return client.TmuxClient, nil
	}

	client.TmuxClient = tmuxClient
	s.LastActive = time.Now()
	s.mu.Unlock()

	return tmuxClient, nil
}

// DetachTmuxClient closes the tmux client for this WebSocket connection
func (s *Session) DetachTmuxClient(ws *websocket.Conn) {
	var tmuxClientToClose *tmux.Client

	s.mu.Lock()
	client, ok := s.Clients[ws]
	if ok && client.TmuxClient != nil {
		tmuxClientToClose = client.TmuxClient
		client.TmuxClient = nil
	}
	s.mu.Unlock()

	// Close tmux client AFTER releasing lock to avoid deadlock
	if tmuxClientToClose != nil {
		_ = tmuxClientToClose.Close()
	}
}

// GetTmuxClient returns the tmux client for this WebSocket connection
func (s *Session) GetTmuxClient(ws *websocket.Conn) *tmux.Client {
	s.mu.Lock()
	defer s.mu.Unlock()

	client, ok := s.Clients[ws]
	if !ok {
		return nil
	}
	return client.TmuxClient
}

// CloseAllClients closes all tmux clients in this session
func (s *Session) CloseAllClients() {
	var tmuxClientsToClose []*tmux.Client

	s.mu.Lock()
	for _, client := range s.Clients {
		if client.TmuxClient != nil {
			tmuxClientsToClose = append(tmuxClientsToClose, client.TmuxClient)
		}
		close(client.SendCh)
	}
	s.Clients = make(map[*websocket.Conn]*Client)
	s.mu.Unlock()

	// Close tmux clients AFTER releasing lock to avoid deadlock
	for _, tc := range tmuxClientsToClose {
		_ = tc.Close()
	}
}

// SetMasterAndSize sets the master client and updates unified size
// Returns changed=true if size changed, seq is the new sequence number
func (s *Session) SetMasterAndSize(ws *websocket.Conn, cols, rows int, reason string) (changed bool, seq uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if size actually changed
	if s.ActiveCols == cols && s.ActiveRows == rows && s.MasterWS == ws {
		return false, s.ResizeSeq
	}

	s.MasterWS = ws
	s.ActiveCols = cols
	s.ActiveRows = rows
	s.ResizeSeq++
	s.LastActive = time.Now()

	return true, s.ResizeSeq
}

// SnapshotSize returns the current unified size and sequence number
func (s *Session) SnapshotSize() (cols, rows int, seq uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ActiveCols, s.ActiveRows, s.ResizeSeq
}

// ResizeAllTmuxClients resizes all tmux clients to the unified size
func (s *Session) ResizeAllTmuxClients(cols, rows int) error {
	s.mu.Lock()
	clients := make([]*tmux.Client, 0, len(s.Clients))
	for _, client := range s.Clients {
		if client.TmuxClient != nil {
			clients = append(clients, client.TmuxClient)
		}
	}
	s.mu.Unlock()

	for _, tc := range clients {
		_ = tc.Resize(cols, rows)
	}
	return nil
}

// BroadcastResize returns all client connections except the excluded one for resize broadcast
func (s *Session) BroadcastResize(cols, rows int, seq uint64, exclude *websocket.Conn) []*websocket.Conn {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([]*websocket.Conn, 0, len(s.Clients))
	for ws := range s.Clients {
		if ws != exclude {
			result = append(result, ws)
		}
	}
	return result
}
