# Frontend Quality Guidelines

## Required Checks

For frontend code changes, the minimum useful check is:

```bash
npm run build
```

Run it from `frontend/`. It performs TypeScript checking and Vite build.

There is currently no configured frontend test runner. If adding tests, choose
and configure the runner in the task rather than pretending tests already exist.

For docs-only Trellis spec changes, it is acceptable to skip the frontend build
and report it as not executed.

## Terminal And WebSocket Review

Terminal changes need extra review because regressions can look like rendering,
input, paste, resize, or connection bugs.

Check:

- Binary PTY frames still reach xterm as bytes.
- Text frames still parse as `ControlMessage`.
- Keepalive ping/pong remains at the socket layer.
- Stale WebSocket callbacks cannot overwrite current connection state.
- Flow control pause/resume messages still map to backend subscriber pause.
- Reconnect/session switch paths clear or preserve state intentionally.
- Resize events are sent after font load, container resize, viewport changes,
  and reconnects.

Reference:

- `frontend/src/shared/core/socket.ts`
- `frontend/src/shared/components/TerminalView.tsx`
- `backend/internal/pty/handler.go`

## Mobile Review

Mobile terminal behavior has dedicated workarounds. Before changing it, inspect:

- `MobileShell.tsx`
- `MobileTerminalLayer.tsx`
- `KeyboardBar.tsx`
- `KeyboardPanel.tsx`
- `InputHandler.ts`
- `ImeController.ts`
- `TouchScrollHandler.ts`

Check:

- `visualViewport` keyboard detection still cleans up listeners.
- IME composition does not send partial characters.
- Modifier keys use `keyboardStore` latch/lock semantics.
- Mobile refresh still shows the session picker instead of auto-reconnecting.
- Safe-area padding remains on full-height mobile screens.

## State And Async Review

Check:

- Optimistic updates roll back on API failure.
- Session lifecycle changes refresh full session lists when needed.
- Server switching updates both `api.baseUrl` and `socket.remoteBaseUrl`.
- AI workflow events do not store high-frequency `idle` events.
- IDE polling stops when disabled and resets selection on session changes.
- Settings persisted through Zustand use `partialize`.

## UI And Accessibility Review

Current UI uses dense operational layouts rather than marketing pages. Keep new
screens task-focused.

Check:

- Use semantic theme tokens for shared surfaces.
- Icon buttons have `title` or visible labels.
- Buttons that trigger row actions call `stopPropagation`.
- Disabled/loading states prevent duplicate async actions.
- Text truncates or wraps within sidebars, cards, and mobile rows.
- Confirm destructive actions unless the backend enforces a safer flow.
- Do not steal terminal focus unintentionally.

## Code Style

- Keep imports ordered external first, then relative imports.
- Keep route shell logic in route files and shared primitives in `shared`.
- Prefer `useCallback` for handlers passed deeply or used in effects.
- Avoid broad refactors when fixing a narrow UI bug.
- Do not introduce additional global state for data already owned by a store.

## Build Artifacts

`backend/cmd/server/static/` is generated build output. Do not manually edit
generated assets. If a release build requires embedded frontend assets, run the
frontend build and review the generated diff separately from source changes.

## Common Mistakes

- Updating desktop flow but missing mobile flow.
- Adding API fields in the backend without updating `api.ts`.
- Breaking terminal paste by bypassing xterm `paste` behavior.
- Adding browser listeners without cleanup.
- Treating a successful Vite build as a browser smoke test; it is a type/build
  check only.
