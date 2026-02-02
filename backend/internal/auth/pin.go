package auth

import (
	"crypto/rand"
	"math/big"
	"os"
	"strings"
	"sync/atomic"
)

var currentPIN atomic.Value

// Alphanumeric characters for PIN generation (excluding confusing chars like 0/O, 1/I/l)
const pinCharset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"

// PIN length constraints
const (
	minPINLength = 6
	maxPINLength = 12
)

// InitPIN initializes PIN - uses WINTERM_PIN env var if set, otherwise generates random
func InitPIN() string {
	return InitPINWithConfig("", 0)
}

// InitPINWithConfig initializes PIN with priority: env var > config > random
func InitPINWithConfig(configPIN string, pinLength int) string {
	// Priority 1: Environment variable
	customPIN := os.Getenv("WINTERM_PIN")
	if customPIN != "" && len(customPIN) >= 4 {
		currentPIN.Store(customPIN)
		return customPIN
	}

	// Priority 2: Config file PIN
	if configPIN != "" && len(configPIN) >= 4 {
		currentPIN.Store(configPIN)
		return configPIN
	}

	// Priority 3: Generate random PIN
	return GeneratePIN(pinLength)
}

// GeneratePIN generates an alphanumeric PIN with configurable length.
// Length is clamped to [6,12]; if 0 or out of range, defaults to 6.
func GeneratePIN(length int) string {
	if length < minPINLength || length > maxPINLength {
		length = minPINLength
	}
	pin := make([]byte, length)
	charsetLen := big.NewInt(int64(len(pinCharset)))

	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			// Fallback to a simple pattern if crypto/rand fails
			pin[i] = pinCharset[i%len(pinCharset)]
		} else {
			pin[i] = pinCharset[n.Int64()]
		}
	}

	result := string(pin)
	currentPIN.Store(result)
	return result
}

// ValidatePIN validates the provided PIN (case-insensitive)
func ValidatePIN(pin string) bool {
	if len(pin) < 4 {
		return false
	}
	val, ok := currentPIN.Load().(string)
	if !ok {
		return false
	}
	// Case-insensitive comparison for better UX
	return strings.EqualFold(pin, val)
}
