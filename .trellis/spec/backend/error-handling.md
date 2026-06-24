# Backend Error Handling

## General Pattern

Backend functions return `error`; callers decide whether to log, translate to
HTTP, or ignore a best-effort cleanup failure. Handlers should return after
writing an error response.

Local examples:

- `tmux.NewClient` wraps process setup failures with `%w`.
- `session.Registry.Delete` returns sentinel errors like `ErrSessionNotFound`.
- `api.HandleSessionFileContent` maps stat/read/path failures to specific HTTP
  statuses.
- `monitor.Service.Start` refuses to start if the monitor is disabled or has no
  API key.

Avoid panics in request handlers and goroutines. `log.Fatalf` is currently used
only in `main()` for startup failures that make the server unusable, such as
missing tmux or broken embedded static assets.

## HTTP JSON Errors

REST handlers should use:

- `writeJSON(w, status, payload)` for normal JSON responses.
- `writeError(w, status, "message")` for API errors.

The API error body is:

```json
{"error":"message"}
```

Reference:

- `backend/internal/api/handler.go`
- `backend/internal/api/middleware.go`
- `backend/internal/api/files.go`

Use HTTP status codes consistently:

- `400` for malformed input, missing session IDs, invalid paths, and unsupported
  request bodies.
- `401` for missing/invalid/expired auth tokens.
- `403` for authenticated users lacking session/admin permission.
- `404` for absent sessions or files.
- `409` for file save conflicts.
- `413` for files too large for inline editing.
- `415` for non-text inline editing attempts.
- `500` for unexpected server-side failure.

`http.Error` is still used in a few low-level route dispatch and WebSocket
pre-upgrade paths in `main.go` and `pty/handler.go`. New REST endpoints should
prefer `writeError` so the frontend sees the standard JSON shape.

## Auth And Access Errors

Use `AccessManager` and the helpers on `api.Handler`:

- `requireAdmin` for admin-only operations.
- `requireSessionAccess` for session-scoped operations.
- `currentEffectiveAccess` when a handler needs the latest token/grant state.

Guest grants can be revoked while a WebSocket is active. `pty.sendLoop`
periodically re-checks access and closes with code `4003` if access is revoked.
Do not rely only on the permission check performed when the WebSocket was
opened.

Reference:

- `backend/internal/auth/access.go`
- `backend/internal/api/handler.go`
- `backend/internal/pty/handler.go`

## WebSocket And PTY Errors

WebSocket setup errors happen before upgrade and may use plain HTTP errors.
After upgrade:

- Use JSON text messages for terminal-side error notifications, as in
  `Instance.broadcastError`.
- Use explicit WebSocket close codes with `closeWithCode`.
- Keep socket writes serialized through `writeCh` to avoid concurrent write
  errors.
- Drop data on full buffers where the current implementation intentionally
  favors liveness over blocking.

Reference:

- `pty.Handler.ServeWS`
- `pty.Handler.sendLoop`
- `pty.Instance.Write`
- `pty.Instance.broadcastError`

## LLM And Monitor Errors

The AI provider returns normal errors for network/request failures and sanitized
error summaries for malformed model output when possible.

Local examples:

- `llm.OpenAICompatProvider.Summarize` logs request failures through
  `RequestLogger` when enabled.
- Missing JSON in LLM output becomes a `Summary{Tag: "错误", ...}` instead of a
  crash.
- `monitor.ValidateDecisionWithSafetyLevel` returns explicit validation errors
  for low confidence, missing evidence, deny keywords, or too many actions.

Do not silently auto-reply when validation fails. Failed decisions should stay
visible through monitor workflow/action logging rather than being retried in an
unbounded loop.

## Common Mistakes

- Writing an error response and then continuing the handler.
- Returning raw internal errors to clients for auth or file access decisions.
- Swallowing tmux process failures that should prevent a connection.
- Holding registry/session locks while doing process, filesystem, HTTP, or LLM
  work.
- Adding frontend-specific error formats instead of the API `{"error":...}`
  contract.
