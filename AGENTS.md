# AGENTS.md — WinTerm Bridge

Web-based terminal connecting browsers to tmux sessions over WebSocket.
Go 1.22 backend + React 18/TypeScript frontend (Vite + Tailwind CSS).

## Project Structure

```
backend/                    # Go server
  cmd/server/main.go        # Entry point, routing, embedded static assets
  internal/
    api/                    # REST handlers + auth middleware
    auth/                   # PIN & JWT authentication
    config/                 # Config load/save (~/.config/winterm-bridge/)
    email/                  # SMTP notifications
    ide/                    # IDE integration
    llm/                    # LLM client for AI features
    monitor/                # AI session monitor + auto-reply
    pty/                    # PTY management & WebSocket handler
    session/                # Session registry & persistence
    tmux/                   # tmux client wrapper
frontend/                   # React SPA
  src/
    App.tsx                 # Router: /desktop, /mobile with lazy loading
    routes/desktop/         # Desktop UI components
    routes/mobile/          # Mobile UI components
    shared/
      core/api.ts           # API types & fetch helpers
      core/socket.ts        # WebSocket client
      components/           # Shared UI components
      hooks/                # Custom hooks (useDeviceType, useTheme, useViewport)
      stores/               # Zustand stores (aiStore, settingsStore, etc.)
      utils/                # Utilities (clipboard)
scripts/
  build.sh                  # Cross-platform release builds
  dev.sh                    # Dev: build + run with hot reload
```

## Build & Run Commands

### Frontend (from `frontend/`)
```bash
npm install                 # Install dependencies
npm run dev                 # Vite dev server on :3000 (proxies /api + /ws to :8080)
npm run build               # TypeScript check + Vite build → backend/cmd/server/static/
tsc                         # Type-check only (no emit)
```

### Backend (from `backend/`)
```bash
go build -o winterm-bridge ./cmd/server    # Build binary
go run ./cmd/server                        # Run directly
go vet ./...                               # Lint
```

### Full Project
```bash
./scripts/dev.sh            # Build frontend + backend, start server
./scripts/dev.sh build      # Build only (no start)
./scripts/dev.sh stop       # Stop running server
./scripts/build.sh          # Release build for current platform → dist/
./scripts/build.sh --all    # Cross-compile all platforms
```

### Tests
No test suite exists. No `*_test.go` or `*.test.ts` files.
If adding tests:
- Go: `go test ./internal/...` or single package `go test ./internal/api/`
- Frontend: add vitest, run with `npx vitest --run`

## Code Style — Go Backend

### Formatting & Imports
- Standard `gofmt` formatting (tabs, no config needed)
- Import groups: stdlib → internal packages (`winterm-bridge/internal/...`)
- No external router — uses `http.NewServeMux()` with manual path matching

### Naming
- Exported types: `PascalCase` (`Handler`, `SessionInfo`, `AuthMiddleware`)
- Unexported helpers: `camelCase` (`writeJSON`, `writeError`, `maskAPIKey`)
- Package names: single lowercase word (`api`, `auth`, `config`, `pty`)
- Context keys: typed `contextKey` string constants

### Struct Tags
- JSON tags use `snake_case`: `json:"api_key"`, `json:"created_at"`
- Optional fields: `json:"title,omitempty"`

### Error Handling
- Return `error` from functions, caller decides to log or propagate
- `log.Printf("Warning: ...")` for non-fatal issues
- `log.Fatalf(...)` only in `main()` for startup failures
- HTTP errors via `writeError(w, http.StatusXxx, "message")`
- Never panic in handlers

### HTTP Patterns
```go
// Handler method signature
func (h *Handler) HandleFoo(w http.ResponseWriter, r *http.Request) { ... }

// Response helpers
writeJSON(w, http.StatusOK, responseStruct)
writeError(w, http.StatusBadRequest, "descriptive error")

// Auth: wrap handlers with AuthMiddleware
api.AuthMiddleware(apiHandler.HandleFoo)
```

### Dependencies (minimal)
- `github.com/gorilla/websocket` — WebSocket
- `github.com/creack/pty` — PTY allocation
- Everything else is stdlib

## Code Style — TypeScript Frontend

### TypeScript Config
- `strict: true` with `noUnusedLocals` and `noUnusedParameters`
- Target: ES2020, JSX: react-jsx
- Module: ESNext with bundler resolution
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`

### Naming Conventions
- Components: `PascalCase` function + file (`AuthScreen.tsx`, `TerminalView.tsx`)
- Hooks: `use` prefix (`useDeviceType`, `useTheme`)
- Stores: `use[Name]Store` (`useSettingsStore`, `useAIStore`)
- Interfaces: `PascalCase`, no `I` prefix (`SessionInfo`, `AIConfig`)
- Variables/functions: `camelCase`
- Files: `PascalCase` for components, `camelCase` for utilities/hooks

### Imports
- External packages first, then relative imports
- React imports: `import { useState, useEffect } from 'react'`
- Lazy loading for route-level components: `const X = lazy(() => import(...))`

### React Patterns
- Functional components only (no classes)
- `export default function ComponentName()` for page/route components
- Named exports for shared components and hooks
- Zustand for global state (no Redux, no Context for state)
- Store pattern: `create<StateInterface>()((set) => ({ ... }))`
- Persist middleware for settings: `persist((set) => ..., { name: 'key' })`

### Styling
- Tailwind CSS utility classes (no CSS modules, no styled-components)
- Semantic color tokens via CSS variables: `bg-canvas`, `text-text-primary`, `border-theme-border`
- Theme system: CSS variables in `:root` (dark default) and `[data-theme='light']`
- Custom colors defined in `tailwind.config.js` mapping to CSS vars
- Use `clsx()` for conditional class composition

### API Types
- All API interfaces defined in `shared/core/api.ts`
- Mirror backend JSON structure with TypeScript interfaces
- Use `snake_case` for API fields to match Go JSON tags

### File Organization
- Route-specific components go in `routes/desktop/` or `routes/mobile/`
- Shared components in `shared/components/`
- One component per file, filename matches component name
- Hooks in `shared/hooks/`, stores in `shared/stores/`

## Architecture Notes

- Frontend builds into `backend/cmd/server/static/` and is embedded via Go `embed`
- Vite dev server proxies `/api` → `:8080` and `/ws` → `ws://localhost:8080`
- Config persisted at `~/.config/winterm-bridge/runtime.json`
- Sessions backed by tmux — the Go server manages PTY ↔ WebSocket bridging
- No ORM, no database — all state is in-memory + tmux + config file
- PIN auth → JWT token → Bearer header for API, attachment tokens for WebSocket
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
