package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
)

func GenerateToken() string {
	var b [16]byte
	_, err := rand.Read(b[:])
	if err != nil {
		return ""
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4],
		b[4:6],
		b[6:8],
		b[8:10],
		b[10:16],
	)
}

// DeriveSessionID generates a deterministic Session ID from tmux session name using SHA256
func DeriveSessionID(tmuxName string) string {
	hash := sha256.Sum256([]byte(tmuxName))
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		hash[0:4], hash[4:6], hash[6:8], hash[8:10], hash[10:16])
}

func ValidateToken(token string) bool {
	if len(token) != 36 {
		return false
	}
	for i, r := range token {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			if !isHex(r) {
				return false
			}
		}
	}
	return true
}

func isHex(r rune) bool {
	return (r >= '0' && r <= '9') ||
		(r >= 'a' && r <= 'f') ||
		(r >= 'A' && r <= 'F')
}
