# Backend Development Guidelines

These guides describe the Go backend as it exists now: a small `net/http`
server, tmux-backed terminal sessions, WebSocket PTY bridging, file-backed
configuration, and optional AI/IDE/email integrations.

## Guidelines Index

| Guide | Description | Status |
| --- | --- | --- |
| [Directory Structure](./directory-structure.md) | Backend package ownership, entry points, and module placement | Filled |
| [Database Guidelines](./database-guidelines.md) | No-database policy, `runtime.json` state, and filesystem boundaries | Filled |
| [Error Handling](./error-handling.md) | Go error propagation, HTTP JSON errors, WebSocket close behavior | Filled |
| [Logging Guidelines](./logging-guidelines.md) | `log.Printf` conventions, sensitive data boundaries, AI logs | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Concurrency, tmux/PTY safety, tests, review checks | Filled |
| [Trellis Context API](./trellis-context-api.md) | Read-only Trellis context API contract and source safety rules | Filled |

## Pre-Development Checklist

Before editing backend code, read:

- `directory-structure.md` when adding handlers, packages, tmux/session/PTY behavior, or config-backed features.
- `database-guidelines.md` before adding persistent state, file operations, upload handling, or anything that resembles storage.
- `error-handling.md` before changing API responses, authentication, WebSocket connection behavior, LLM calls, or tmux process operations.
- `logging-guidelines.md` before adding logs around auth, AI providers, WebSocket sessions, user terminal output, or config values.
- `quality-guidelines.md` before touching concurrency, locks, goroutines, tmux commands, PTY buffering, or tests.
- `trellis-context-api.md` before changing Trellis context endpoints, structured artifact parsing, source fallback, or `.trellis/` path validation.

Also read `../guides/index.md` for cross-layer and reuse checks when a backend
change affects frontend API types, WebSocket message shapes, config fields, or
shared status semantics.
