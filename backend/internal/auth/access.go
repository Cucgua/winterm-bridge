package auth

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DefaultTokenTTL = 24 * time.Hour
)

type AccessRole string

const (
	RoleAdmin AccessRole = "admin"
	RoleGuest AccessRole = "guest"
)

var (
	ErrInvalidPIN         = errors.New("invalid PIN")
	ErrEmptySessionAccess = errors.New("at least one session must be authorized")
	ErrGuestGrantNotFound = errors.New("guest authorization not found")
)

// AccessToken describes an authenticated user token with role and optional session scope.
type AccessToken struct {
	Token             string
	Role              AccessRole
	GrantID           string
	AllowedSessionIDs map[string]struct{}
	IssuedAt          time.Time
	ExpiresAt         time.Time
}

func (t *AccessToken) IsAdmin() bool {
	return t != nil && t.Role == RoleAdmin
}

func (t *AccessToken) CanAccessSession(sessionID string) bool {
	if t == nil || sessionID == "" {
		return false
	}
	if t.IsAdmin() {
		return true
	}
	_, ok := t.AllowedSessionIDs[sessionID]
	return ok
}

func (t *AccessToken) AllowedSessionList() []string {
	if t == nil || len(t.AllowedSessionIDs) == 0 {
		return nil
	}
	ids := make([]string, 0, len(t.AllowedSessionIDs))
	for id := range t.AllowedSessionIDs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// GuestGrant describes a guest PIN authorization entry.
// PIN is only returned when created, list operations should use MaskedPIN.
type GuestGrant struct {
	ID         string     `json:"id"`
	PIN        string     `json:"pin,omitempty"`
	MaskedPIN  string     `json:"masked_pin,omitempty"`
	SessionIDs []string   `json:"session_ids"`
	CreatedAt  time.Time  `json:"created_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	Active     bool       `json:"active"`
}

type guestGrantRecord struct {
	ID                string
	PIN               string
	NormalizedPIN     string
	AllowedSessionIDs map[string]struct{}
	CreatedAt         time.Time
	RevokedAt         *time.Time
}

// AccessManager manages guest PIN authorizations and issued access tokens.
type AccessManager struct {
	mu              sync.RWMutex
	guestPINLength  int
	tokenTTL        time.Duration
	tokens          map[string]*AccessToken
	guestGrants     map[string]*guestGrantRecord
	guestGrantByPIN map[string]string
}

func NewAccessManager(guestPINLength int) *AccessManager {
	length := guestPINLength
	if length < minPINLength || length > maxPINLength {
		length = 8
	}
	return &AccessManager{
		guestPINLength:  length,
		tokenTTL:        DefaultTokenTTL,
		tokens:          make(map[string]*AccessToken),
		guestGrants:     make(map[string]*guestGrantRecord),
		guestGrantByPIN: make(map[string]string),
	}
}

func (m *AccessManager) AuthenticatePIN(pin string) (*AccessToken, error) {
	now := time.Now()
	normalized := normalizePIN(pin)
	if normalized == "" {
		return nil, ErrInvalidPIN
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.cleanupExpiredTokensLocked(now)

	// Admin PIN always takes precedence.
	if ValidatePIN(pin) {
		access := m.issueTokenLocked(RoleAdmin, "", nil, now)
		if access == nil {
			return nil, errors.New("failed to issue access token")
		}
		return access, nil
	}

	grantID, ok := m.guestGrantByPIN[normalized]
	if !ok {
		return nil, ErrInvalidPIN
	}

	grant := m.guestGrants[grantID]
	if grant == nil || grant.RevokedAt != nil {
		delete(m.guestGrantByPIN, normalized)
		return nil, ErrInvalidPIN
	}

	access := m.issueTokenLocked(RoleGuest, grant.ID, grant.AllowedSessionIDs, now)
	if access == nil {
		return nil, errors.New("failed to issue access token")
	}
	return access, nil
}

func (m *AccessManager) ValidateToken(token string) (*AccessToken, bool) {
	if token == "" {
		return nil, false
	}

	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cleanupExpiredTokensLocked(now)

	access, ok := m.tokens[token]
	if !ok {
		return nil, false
	}

	if access.Role == RoleGuest {
		grant := m.guestGrants[access.GrantID]
		if grant == nil || grant.RevokedAt != nil {
			delete(m.tokens, token)
			return nil, false
		}
	}

	return cloneAccessToken(access), true
}

func (m *AccessManager) CanAccessSession(token, sessionID string) bool {
	access, ok := m.ValidateToken(token)
	if !ok {
		return false
	}
	return access.CanAccessSession(sessionID)
}

func (m *AccessManager) CreateGuestGrant(sessionIDs []string) (*GuestGrant, error) {
	normalizedSessionIDs := dedupeSessionIDs(sessionIDs)
	if len(normalizedSessionIDs) == 0 {
		return nil, ErrEmptySessionAccess
	}

	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()

	grantID, err := m.generateUniqueIDLocked()
	if err != nil {
		return nil, err
	}

	pin, normalizedPIN, err := m.generateUniqueGuestPINLocked()
	if err != nil {
		return nil, err
	}

	grant := &guestGrantRecord{
		ID:                grantID,
		PIN:               pin,
		NormalizedPIN:     normalizedPIN,
		AllowedSessionIDs: sessionIDSet(normalizedSessionIDs),
		CreatedAt:         now,
	}
	m.guestGrants[grant.ID] = grant
	m.guestGrantByPIN[grant.NormalizedPIN] = grant.ID

	return m.buildGuestGrant(grant, true), nil
}

func (m *AccessManager) ListGuestGrants() []GuestGrant {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]GuestGrant, 0, len(m.guestGrants))
	for _, grant := range m.guestGrants {
		out = append(out, *m.buildGuestGrant(grant, false))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

func (m *AccessManager) RevokeGuestGrant(grantID string) error {
	if grantID == "" {
		return ErrGuestGrantNotFound
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	grant, ok := m.guestGrants[grantID]
	if !ok {
		return ErrGuestGrantNotFound
	}

	if grant.RevokedAt == nil {
		now := time.Now()
		grant.RevokedAt = &now
		delete(m.guestGrantByPIN, grant.NormalizedPIN)
	}

	for token, access := range m.tokens {
		if access.GrantID == grantID {
			delete(m.tokens, token)
		}
	}

	return nil
}

func (m *AccessManager) issueTokenLocked(role AccessRole, grantID string, allowedSessionIDs map[string]struct{}, now time.Time) *AccessToken {
	token := ""
	for i := 0; i < 4; i++ {
		candidate := GenerateToken()
		if candidate == "" {
			continue
		}
		if _, exists := m.tokens[candidate]; exists {
			continue
		}
		token = candidate
		break
	}
	if token == "" {
		return nil
	}

	access := &AccessToken{
		Token:             token,
		Role:              role,
		GrantID:           grantID,
		AllowedSessionIDs: copySessionIDSet(allowedSessionIDs),
		IssuedAt:          now,
		ExpiresAt:         now.Add(m.tokenTTL),
	}
	m.tokens[token] = access
	return cloneAccessToken(access)
}

func (m *AccessManager) cleanupExpiredTokensLocked(now time.Time) {
	for token, access := range m.tokens {
		if now.After(access.ExpiresAt) {
			delete(m.tokens, token)
			continue
		}
		if access.Role == RoleGuest {
			grant := m.guestGrants[access.GrantID]
			if grant == nil || grant.RevokedAt != nil {
				delete(m.tokens, token)
			}
		}
	}
}

func (m *AccessManager) generateUniqueIDLocked() (string, error) {
	for i := 0; i < 8; i++ {
		id := GenerateToken()
		if id == "" {
			continue
		}
		if _, exists := m.guestGrants[id]; exists {
			continue
		}
		return id, nil
	}
	return "", errors.New("failed to generate authorization id")
}

func (m *AccessManager) generateUniqueGuestPINLocked() (string, string, error) {
	for i := 0; i < 16; i++ {
		pin := GenerateRandomPIN(m.guestPINLength)
		normalized := normalizePIN(pin)
		if normalized == "" {
			continue
		}
		// Avoid colliding with admin PIN.
		if ValidatePIN(pin) {
			continue
		}
		if _, exists := m.guestGrantByPIN[normalized]; exists {
			continue
		}
		return pin, normalized, nil
	}
	return "", "", errors.New("failed to generate guest PIN")
}

func (m *AccessManager) buildGuestGrant(grant *guestGrantRecord, includePIN bool) *GuestGrant {
	if grant == nil {
		return nil
	}
	sessionIDs := make([]string, 0, len(grant.AllowedSessionIDs))
	for id := range grant.AllowedSessionIDs {
		sessionIDs = append(sessionIDs, id)
	}
	sort.Strings(sessionIDs)

	result := &GuestGrant{
		ID:         grant.ID,
		MaskedPIN:  maskPIN(grant.PIN),
		SessionIDs: sessionIDs,
		CreatedAt:  grant.CreatedAt,
		RevokedAt:  grant.RevokedAt,
		Active:     grant.RevokedAt == nil,
	}
	if includePIN {
		result.PIN = grant.PIN
	}
	return result
}

func normalizePIN(pin string) string {
	return strings.ToUpper(strings.TrimSpace(pin))
}

func dedupeSessionIDs(sessionIDs []string) []string {
	if len(sessionIDs) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(sessionIDs))
	out := make([]string, 0, len(sessionIDs))
	for _, raw := range sessionIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func sessionIDSet(sessionIDs []string) map[string]struct{} {
	set := make(map[string]struct{}, len(sessionIDs))
	for _, id := range sessionIDs {
		set[id] = struct{}{}
	}
	return set
}

func copySessionIDSet(src map[string]struct{}) map[string]struct{} {
	if len(src) == 0 {
		return nil
	}
	dst := make(map[string]struct{}, len(src))
	for id := range src {
		dst[id] = struct{}{}
	}
	return dst
}

func cloneAccessToken(src *AccessToken) *AccessToken {
	if src == nil {
		return nil
	}
	return &AccessToken{
		Token:             src.Token,
		Role:              src.Role,
		GrantID:           src.GrantID,
		AllowedSessionIDs: copySessionIDSet(src.AllowedSessionIDs),
		IssuedAt:          src.IssuedAt,
		ExpiresAt:         src.ExpiresAt,
	}
}

func maskPIN(pin string) string {
	if pin == "" {
		return ""
	}
	runes := []rune(pin)
	if len(runes) <= 4 {
		return "****"
	}
	prefix := string(runes[:2])
	suffix := string(runes[len(runes)-2:])
	return prefix + strings.Repeat("*", len(runes)-4) + suffix
}
