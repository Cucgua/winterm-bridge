package ws

import (
	"encoding/json"
	"time"
)

const (
	TypeResize        = "resize"
	TypePing          = "ping"
	TypePong          = "pong"
	TypeAuth          = "auth"
	TypeAuthOK        = "auth_ok"
	TypeError         = "error"
	TypeListSessions  = "list_sessions"
	TypeSessionsList  = "sessions_list"
	TypeSelectSession = "select_session"
	TypeCreateSession = "create_session"
	TypeDeleteSession = "delete_session"
	TypeSessionDeleted = "session_deleted"
	TypeSessionReady   = "session_ready" // tmux multi-client mode: session ready with client info
)

type ControlMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type AuthPayload struct {
	PIN       string `json:"pin"`
	Token     string `json:"token"`
	SessionID string `json:"session_id"`
}

type ResizePayload struct {
	Cols   int    `json:"cols"`
	Rows   int    `json:"rows"`
	Seq    uint64 `json:"seq,omitempty"`    // Sequence number (server push)
	Source string `json:"source,omitempty"` // "server" for server push
}

type AuthOKPayload struct {
	SessionID string `json:"session_id,omitempty"`
	Token     string `json:"token"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

type SessionInfo struct {
	ID         string    `json:"id"`
	State      string    `json:"state"`
	CreatedAt  time.Time `json:"created_at"`
	LastActive time.Time `json:"last_active"`
	Title      string    `json:"title,omitempty"`
	TmuxName   string    `json:"tmux_name,omitempty"`
	TmuxCmd    string    `json:"tmux_cmd,omitempty"`
}

type SessionsListPayload struct {
	Sessions []SessionInfo `json:"sessions"`
}

type SelectSessionPayload struct {
	SessionID string `json:"session_id"`
}

type CreateSessionPayload struct {
	Title string `json:"title,omitempty"`
}

type DeleteSessionPayload struct {
	SessionID string `json:"session_id"`
}

type SessionDeletedPayload struct {
	SessionID string `json:"session_id"`
}
