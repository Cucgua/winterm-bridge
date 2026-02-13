package api

import (
	"context"
	"net/http"
	"strings"

	"winterm-bridge/internal/auth"
)

type contextKey string

const TokenContextKey contextKey = "token"
const AccessContextKey contextKey = "access"

func AccessFromContext(ctx context.Context) (*auth.AccessToken, bool) {
	value := ctx.Value(AccessContextKey)
	if value == nil {
		return nil, false
	}
	access, ok := value.(*auth.AccessToken)
	return access, ok && access != nil
}

// AuthMiddleware creates a middleware that validates Bearer tokens
func AuthMiddleware(accessManager *auth.AccessManager, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if accessManager == nil {
			writeError(w, http.StatusInternalServerError, "authorization is not initialized")
			return
		}

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
		access, ok := accessManager.ValidateToken(token)
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		// Add token to context and proceed
		ctx := context.WithValue(r.Context(), TokenContextKey, token)
		ctx = context.WithValue(ctx, AccessContextKey, access)
		next(w, r.WithContext(ctx))
	}
}
