# Backend Logging Guidelines

## Logging Library

The backend uses the Go standard library `log` package. There is no structured
logger or log level framework.

Common formats:

- Startup and lifecycle: `log.Printf("tmux detected: %s", version)`.
- Non-fatal issues: `log.Printf("Warning: ...")`.
- Domain-prefixed operational events: `[API]`, `[Registry]`, `[Monitor]`.
- Fatal startup failures in `main()` only: `log.Fatalf(...)`.

Reference files:

- `backend/cmd/server/main.go`
- `backend/internal/api/handler.go`
- `backend/internal/session/registry.go`
- `backend/internal/monitor/service.go`

## What To Log

Log events that help diagnose production behavior without exposing terminal
content or secrets:

- Server startup, tmux detection, listening address.
- Config load/save failures that have fallback behavior.
- Failure to apply tmux configuration to discovered or new sessions.
- Monitor start/stop and action queue state transitions.
- Guest access synchronization failures after session changes.
- External integration failures when the caller does not get enough context.

Use short domain prefixes when logs come from background services:

```go
log.Printf("[Monitor] AI monitor started (interval: %ds, lines: %d)", cfg.Interval, cfg.Lines)
log.Printf("[Registry] Warning: failed to apply tmux config to discovered session %s: %v", tmuxName, err)
```

## Sensitive Data Boundaries

Do not add new logs that expose:

- API keys, SMTP passwords, bearer tokens, guest PINs, or full attachment tokens.
- Full terminal screen contents or pasted user input.
- Full AI request payloads unless the explicit AI request logger is enabled.
- File contents from the session file manager.

Existing behavior has two important exceptions:

- Startup logs the admin PIN for the install/runtime UX in `main.go`.
- API auth logs only the token prefix: `access.Token[:8]`.

Do not expand these exceptions. For API keys shown in responses or logs, use
masking patterns like `maskAPIKey` in `api/handler.go`.

## AI Request Logging

AI request logging is a user-controlled feature, not general server logging.
When enabled, `llm.GetRequestLogger()` writes detailed request/response records
for summarize and auto-reply decisions under the runtime config directory.

Reference:

- `backend/internal/llm/logger.go`
- `backend/internal/llm/openai_compat.go`
- `backend/internal/config/config.go` (`AILogEnabled`, `AILogDir`)

Keep this logging behind the existing config switch. Do not log raw prompts or
screen content with `log.Printf`.

## Error Log Style

- Use `Warning:` for recoverable startup/config/tmux issues.
- Include enough context to identify the session or feature, but prefer short
  IDs or names over full payloads.
- Do not log every WebSocket frame, PTY chunk, or monitor idle event.
- Prefer returning an API error over logging and hiding the failure.

## Common Mistakes

- Logging full bearer tokens or API keys while debugging auth.
- Logging AI prompt content through the global logger.
- Treating high-frequency monitor idle events as normal server logs.
- Adding a separate logging package for one feature without changing the whole
  backend logging strategy.
