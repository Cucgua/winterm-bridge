# Backend Quality Guidelines

## Formatting And Imports

- Run `gofmt` on modified Go files.
- Keep imports grouped as standard library, blank line, third-party packages,
  blank line, local `winterm-bridge/internal/...` packages.
- Keep package-level dependencies minimal and explicit.

Reference:

- `backend/internal/api/handler.go`
- `backend/internal/pty/handler.go`

## Concurrency And Locking

This backend is concurrency-heavy: sessions, PTY instances, WebSocket
subscribers, monitor loops, token stores, and config writes all share mutable
state. Follow the established lock discipline.

Required patterns:

- Use `sync.Mutex` / `sync.RWMutex` around shared maps and state.
- Copy required values under lock, then release the lock before process,
  filesystem, network, WebSocket, or channel-close work.
- Close tmux clients after releasing session locks.
- Do not hold registry locks while calling session methods that take their own
  locks.
- Use `sync.Once` for idempotent close paths.

Reference examples:

- `session.Session.RemoveClient`
- `session.Session.AttachTmuxClient`
- `session.Registry.Attach`
- `session.Registry.Delete`
- `pty.Manager.EnsureInstance`
- `pty.Instance.close`

Avoid adding lock nesting unless you can show it follows an existing safe order.

## tmux And PTY Safety

tmux process interaction belongs in `internal/tmux` or `internal/pty`.

Required patterns:

- Use `exec.Command` with argument slices, not shell-concatenated command
  strings.
- Sanitize tmux session names with `sanitizeTmuxName`.
- Check tmux session existence before starting a PTY attachment.
- Serialize WebSocket writes.
- Keep bounded channels for PTY input/output and intentionally decide whether to
  drop or block on overflow.
- Re-apply tmux config to created and discovered sessions.

Reference:

- `tmux.CreateSession`
- `tmux.ApplyToNewSession`
- `pty.Handler.sendLoop`
- `pty.Instance.Write`

## Cross-Layer Contracts

Any backend JSON shape consumed by the frontend must be mirrored in
`frontend/src/shared/core/api.ts` using the same `snake_case` field names.

Contracts that require extra care:

- REST responses and request bodies in `api/handler.go`.
- WebSocket text control messages in `pty/handler.go` and
  `frontend/src/shared/core/socket.ts`.
- AI workflow event and summary message fields.
- `runtime.json` config structs and frontend settings forms.

Read `../guides/cross-layer-thinking-guide.md` when changing these shapes.

## Tests And Verification

Current test coverage is small. The trusted local backend test example is
`backend/internal/api/files_test.go`, which uses table-driven tests and
`t.Parallel()`.

When adding backend behavior:

- Add targeted Go tests for pure helpers, path safety, auth/session rules, or
  config defaults when feasible.
- Use table-driven tests for small deterministic functions.
- Use `t.TempDir()` for filesystem tests.
- Keep tmux/PTY integration tests out of unit tests unless the environment
  setup is explicit.

Validation commands:

- Backend unit tests: `timeout 60s go test ./internal/...` from `backend/`.
- Build check: `go build -o winterm-bridge ./cmd/server` from `backend/`.
- Static inspection: `go vet ./...` from `backend/`.

For docs-only changes, it is acceptable to run no Go build/test and report that
they were not executed.

## Review Checklist

Before calling backend work done, check:

- No handler continues after `writeError`.
- No user-controlled path bypasses root resolution.
- No new secret/token/API key logging.
- No shell command is built by concatenating untrusted input.
- No process, filesystem, network, or WebSocket operation is performed while
  holding a registry/session/config lock.
- Frontend API types were updated for any changed JSON field.
- Existing config defaults still work when `runtime.json` is absent or missing a
  new section.
