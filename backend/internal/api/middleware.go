package api

import (
	"context"
	"net/http"
	"strings"

	"winterm-bridge/internal/auth"
)

type contextKey string

const TokenContextKey contextKey = "token"

// AuthMiddleware creates a middleware that validates Bearer tokens
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		// Check for Bearer token
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			writeError(w, http.StatusUnauthorized, "invalid authorization header format")
			return
		}

		token := parts[1]
		if token == "" {
			writeError(w, http.StatusUnauthorized, "missing token")
			return
		}

		// Validate token
		if !auth.ValidateToken(token) {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		// Add token to context and proceed
		ctx := context.WithValue(r.Context(), TokenContextKey, token)
		next(w, r.WithContext(ctx))
	}
}
