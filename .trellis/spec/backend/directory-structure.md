# Backend Directory Structure

## Runtime Shape

The backend is a Go 1.22 application under `backend/`. It uses the standard
library HTTP server plus two runtime dependencies:

- `github.com/gorilla/websocket` for WebSocket transport.
- `github.com/creack/pty` for PTY allocation.

There is no external router, ORM, job framework, or dependency injection
container. New backend work should follow the existing package boundaries and
wire dependencies explicitly from `backend/cmd/server/main.go`.

## Entry Point And Routing

`backend/cmd/server/main.go` owns startup, dependency construction, route
registration, static asset embedding, CORS behavior, and cleanup goroutines.

Local patterns:

- Keep CLI flags and environment overrides in `main.go`.
- Build shared services once in `main.go`, then pass them into handlers.
- Register REST endpoints with `http.NewServeMux()` and `mux.HandleFunc`.
- Use small method switches or suffix checks for grouped paths like
  `/api/sessions/{id}/...`.
- Serve the built frontend from embedded `static/` with SPA fallback.

Reference files:

- `backend/cmd/server/main.go`
- `frontend/vite.config.ts`

Avoid adding a new router unless the whole routing layer is intentionally
changed. The current API shape relies on explicit `ServeMux` registration.

## Package Ownership

`backend/internal/api/`

- Owns REST request/response structs, JSON helpers, auth middleware, HTTP
  handlers, upload/file APIs, AI/email/tmux/IDE endpoints, and response
  projection from internal types.
- `handler.go` contains shared handler dependencies and most API contracts.
- `files.go` contains the session-rooted file manager API and path safety
  helpers.

`backend/internal/auth/`

- Owns admin PIN, guest PIN grants, issued access tokens, short-lived
  WebSocket attachment tokens, and deterministic session ID derivation.
- Admin and guest access rules belong here, not in frontend components.

`backend/internal/config/`

- Owns `~/.config/winterm-bridge/runtime.json` schema, defaults, load/save
  helpers, and config mutation functions.
- New persistent app settings should be typed here first, then mirrored in
  frontend API types.

`backend/internal/session/`

- Owns the in-memory session registry, session lifecycle, persistent/ghost
  session behavior, archive flags, and tmux discovery.
- This package coordinates `tmux` and `config`, but it should not write HTTP
  responses.

`backend/internal/tmux/`

- Owns direct `tmux` command execution, control-mode client parsing, session
  creation, config application, and pane capture helpers.
- Shell construction should stay here; callers should not duplicate tmux
  command details.

`backend/internal/pty/`

- Owns the PTY-backed WebSocket bridge, subscriber fan-out, resize/pause/resume
  control messages, and active permission re-checks.
- WebSocket token consumption happens before the connection is upgraded.

`backend/internal/monitor/`

- Owns the AI session monitor loop, context-change detection, action queue,
  auto-reply safety gate, workflow events, and email notification decisions.
- It reads terminal context through session/tmux abstractions and writes user
  input through the adapter layer.

`backend/internal/llm/`

- Owns OpenAI-compatible request/response formats, prompts, JSON extraction,
  request logging, and provider interfaces.

`backend/internal/email/` and `backend/internal/ide/`

- Own SMTP sending and IDEA Context Server integration respectively.

## Naming And File Placement

- Package names are short lowercase words: `api`, `auth`, `config`, `monitor`.
- Exported Go types use `PascalCase`; unexported helpers use `camelCase`.
- HTTP handlers are methods named `HandleX`.
- API JSON fields use `snake_case` tags and must match `frontend/src/shared/core/api.ts`.
- Helpers that are specific to one domain stay near that domain. For example,
  file path safety helpers belong in `api/files.go`; tmux command details belong
  in `tmux/`.

## Adding A Backend Feature

Use this order for most backend additions:

1. Add or update the typed config/API structs in the owning package.
2. Add business logic to the package that owns the side effect.
3. Add `Handler` methods in `internal/api` only for HTTP translation.
4. Wire routes and service dependencies in `cmd/server/main.go`.
5. Mirror API fields in `frontend/src/shared/core/api.ts` if the frontend calls it.

Reference examples:

- AI config path: `config.AIMonitorConfig` -> `monitor.Service.UpdateConfig` -> `api.HandleAIConfig` -> `/api/ai/config`.
- Session attach path: `api.HandleAttachSession` -> `auth.AttachmentTokenStore` -> `pty.Handler.ServeWS`.
- File manager path: `api.HandleSessionFiles` and `resolvePathWithinRoot`.
