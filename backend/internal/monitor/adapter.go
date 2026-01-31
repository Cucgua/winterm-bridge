package monitor

// SessionLister provides session listing capability
type SessionLister interface {
	ListAllForMonitor() []SessionInfo
}

// Broadcaster provides WebSocket broadcast capability
type Broadcaster interface {
	BroadcastToSession(sessionID string, data []byte)
}

// RegistryAdapter adapts session.Registry + pty.Manager into a SessionProvider
type RegistryAdapter struct {
	lister      SessionLister
	broadcaster Broadcaster
}

// NewRegistryAdapter creates a new adapter
func NewRegistryAdapter(lister SessionLister, broadcaster Broadcaster) *RegistryAdapter {
	return &RegistryAdapter{
		lister:      lister,
		broadcaster: broadcaster,
	}
}

func (a *RegistryAdapter) GetAllSessions() []SessionInfo {
	return a.lister.ListAllForMonitor()
}

func (a *RegistryAdapter) BroadcastToSession(sessionID string, data []byte) {
	a.broadcaster.BroadcastToSession(sessionID, data)
}

// NoBroadcaster is a no-op broadcaster for when no WebSocket broadcast is needed
type NoBroadcaster struct{}

func (NoBroadcaster) BroadcastToSession(string, []byte) {}

// Ensure adapter satisfies interface
var _ SessionProvider = (*RegistryAdapter)(nil)
