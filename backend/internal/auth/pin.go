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
	return InitPINWithConfig("")
}

// InitPINWithConfig initializes PIN with priority: env var > config > random
func InitPINWithConfig(configPIN string) string {
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
