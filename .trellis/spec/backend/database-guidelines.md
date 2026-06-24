# Backend Persistence And Storage Guidelines

## No Database

This project currently has no database, ORM, migrations, SQL query layer, or
transaction model. State is split across:

- `~/.config/winterm-bridge/runtime.json` for app configuration and selected
  runtime state.
- tmux itself for live terminal sessions.
- in-memory Go maps for active sessions, issued access tokens, PTY instances,
  monitor state, and queued actions.
- filesystem directories under the configured runtime directory for uploads,
  AI request logs, workflow logs, and custom fonts.

Do not add a database-shaped abstraction for simple settings. Follow the
existing `config` package unless the feature truly needs a separate durable
store and the architecture is explicitly changed.

Reference files:

- `backend/internal/config/config.go`
- `backend/internal/session/registry.go`
- `backend/internal/monitor/action_queue.go`
- `backend/internal/llm/logger.go`

## `runtime.json` Is The Persistent Config Contract

`backend/internal/config/config.go` defines the persistent schema and defaults.
The file is loaded from `ConfigPath()`, which resolves to
`~/.config/winterm-bridge/runtime.json`.

Local patterns:

- Add new persistent settings to `Config` with explicit JSON tags.
- Provide a `DefaultXConfig()` helper when a config section has non-trivial
  defaults, as in `DefaultAutoConfig`, `DefaultTmuxConfig`,
  `DefaultUploadConfig`, and `DefaultIDEConfig`.
- Use `GetXConfig` helpers to return defaults when the config file is absent or
  the section is nil.
- Use `SaveXConfig` or purpose-specific mutators for writes.
- Protect config mutations with `configMu` when a helper performs load-modify-save.

Avoid scattering direct `os.ReadFile(ConfigPath())` or `os.WriteFile(ConfigPath())`
outside the `config` package. The existing pattern centralizes file permissions,
defaults, and concurrency.

## File Permissions And Directories

Persistent config should keep the current permission pattern:

- Runtime config directory: `0700`.
- `runtime.json`: `0600`.

Reference:

- `config.Save`

Uploads and other generated files must stay under their configured root. The
upload defaults live in `DefaultUploadConfig`, and session file browsing is
rooted at the tmux session current path.

## Session-Rooted File Access

The session file manager is deliberately constrained:

- Resolve the current root with `resolveSessionRootPath`.
- Resolve requested paths through `resolvePathWithinRoot`.
- Reject absolute paths and `..` escapes.
- Keep inline editing to text content and `maxEditableFileSize`.
- Require admin access for writes and destructive operations.
- Use `expected_mtime_ms` on file saves to avoid blind overwrites.

Reference files:

- `backend/internal/api/files.go`
- `backend/internal/api/files_test.go`

Do not add file endpoints that accept arbitrary absolute paths from the client.
All file operations should be scoped to the session root or an explicit
runtime-owned directory.

## tmux Is Runtime State

Live terminal state belongs to tmux, not `runtime.json`. The registry discovers
existing tmux sessions and derives stable session IDs with
`auth.DeriveSessionID`.

Persistent sessions are records that let the app restore or show ghost sessions
when a tmux session disappears. They are not a full session snapshot.

Reference:

- `session.Registry.DiscoverExisting`
- `session.Registry.LoadPersistentSessions`
- `config.PersistentSession`

## Adding Durable State

When adding a new durable field:

1. Define the Go struct field and JSON tag in `config.Config` or a nested config
   type.
2. Add defaults through `DefaultXConfig` and `GetXConfig`.
3. Add a save helper that uses `configMu` for load-modify-save writes.
4. Mirror the JSON shape in `frontend/src/shared/core/api.ts`.
5. Update UI stores only after the API contract is typed.

Common mistakes:

- Treating `runtime.json` as append-only event storage.
- Adding frontend-only persisted settings for values the backend must enforce.
- Writing user-controlled paths without going through a root resolver.
- Introducing a second source of truth for session persistence, auto-reply, or
  guest access.
