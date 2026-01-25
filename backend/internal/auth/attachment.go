package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const (
	AttachmentTokenExpiry = 30 * time.Second
)

// AttachmentToken represents a short-lived token for WebSocket attachment
type AttachmentToken struct {
	Token     string
	SessionID string
	UserToken string
	ExpiresAt time.Time
}

// AttachmentTokenStore manages short-lived attachment tokens
type AttachmentTokenStore struct {
	tokens map[string]*AttachmentToken
	mu     sync.RWMutex
}

// NewAttachmentTokenStore creates a new attachment token store
func NewAttachmentTokenStore() *AttachmentTokenStore {
	store := &AttachmentTokenStore{
		tokens: make(map[string]*AttachmentToken),
	}
	// Start cleanup goroutine
	go store.cleanupExpired()
	return store
}

// Generate creates a new attachment token for the given session
func (s *AttachmentTokenStore) Generate(sessionID, userToken string) *AttachmentToken {
	// Generate random token
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)

	attachment := &AttachmentToken{
		Token:     token,
		SessionID: sessionID,
		UserToken: userToken,
		ExpiresAt: time.Now().Add(AttachmentTokenExpiry),
	}

	s.mu.Lock()
	s.tokens[token] = attachment
	s.mu.Unlock()

	return attachment
}

// Validate checks if an attachment token is valid and consumes it (one-time use)
func (s *AttachmentTokenStore) Validate(token string) (*AttachmentToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	attachment, ok := s.tokens[token]
	if !ok {
		return nil, false
	}

	// Check expiry
	if time.Now().After(attachment.ExpiresAt) {
		delete(s.tokens, token)
		return nil, false
	}

	// Consume the token (one-time use)
	delete(s.tokens, token)
	return attachment, true
}

// cleanupExpired periodically removes expired tokens
func (s *AttachmentTokenStore) cleanupExpired() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for token, attachment := range s.tokens {
			if now.After(attachment.ExpiresAt) {
				delete(s.tokens, token)
			}
		}
		s.mu.Unlock()
	}
}
