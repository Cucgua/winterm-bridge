package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"os"
	"sync/atomic"
)

var currentPIN atomic.Value

// InitPIN initializes PIN - uses WINTERM_PIN env var if set, otherwise generates random
func InitPIN() string {
	// Check for custom PIN from environment variable
	customPIN := os.Getenv("WINTERM_PIN")
	if customPIN != "" && len(customPIN) >= 4 {
		currentPIN.Store(customPIN)
		return customPIN
	}
	return GeneratePIN()
}

func GeneratePIN() string {
	max := big.NewInt(1000000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		pin := "000000"
		currentPIN.Store(pin)
		return pin
	}
	pin := fmt.Sprintf("%06d", n.Int64())
	currentPIN.Store(pin)
	return pin
}

func ValidatePIN(pin string) bool {
	if len(pin) < 4 {
		return false
	}
	val, ok := currentPIN.Load().(string)
	return ok && pin == val
}
