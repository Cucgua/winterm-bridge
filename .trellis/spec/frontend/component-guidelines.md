# Frontend Component Guidelines

## Component Style

Components are functional React components. Existing shared components mostly
use named exports with `React.FC`, while route components use default function
exports for lazy loading.

Reference examples:

- `frontend/src/App.tsx`
- `frontend/src/routes/desktop/DesktopApp.tsx`
- `frontend/src/shared/components/TerminalView.tsx`
- `frontend/src/shared/components/AuthScreen.tsx`

Follow the local file style instead of rewriting nearby components to a new
style.

## Props

Props are typed with local `interface` declarations near the component.

Local patterns:

- Callback props use explicit argument types:
  `onSwitchSession: (sessionId: string) => void`.
- Optional callbacks are marked with `?` and guarded before use.
- UI state enums are local string unions when only one component owns them, for
  example `AuthState` and `UploadStatus` in `DesktopApp.tsx`.

Avoid passing raw API response objects deep into unrelated components when a
smaller prop shape is enough. `DesktopLayout` is an accepted shell component
that receives session lists and callbacks because it owns the sidebar workflow.

## API And Socket Handling In Components

Route shells own connection and auth workflows:

- `DesktopApp.tsx` validates tokens, lists sessions, switches servers, attaches
  WebSocket sessions, and handles socket control messages.
- `MobileShell.tsx` owns the mobile session picker flow and mobile terminal
  connection state.

Leaf components should call API methods when the feature is local to that
component or settings panel. Examples include `SessionPicker` fetching per
session settings and `DesktopLayout` loading IDE config.

Do not duplicate low-level fetch or WebSocket code inside UI components. Use
`api` from `shared/core/api.ts` and `socket` / `SocketService` from
`shared/core/socket.ts`.

## Terminal Component Rules

`TerminalView` is a high-risk component because it bridges xterm.js, clipboard,
custom fonts, IME behavior, mobile keyboard workarounds, resize sync, and binary
PTY frames.

When editing terminal behavior:

- Preserve `ArrayBuffer` handling for PTY output.
- Preserve text-frame JSON control messages in `SocketService`.
- Keep terminal initialization delayed until fonts and container dimensions are
  ready.
- Keep IME composition guards and duplicate-input suppression.
- Browser-reserved terminal shortcuts, such as `Alt+ArrowLeft` and
  `Alt+ArrowRight`, must be intercepted before the browser handles history
  navigation and translated into explicit terminal input sequences.
- Keep resize sync paths for font changes, viewport changes, reconnects, and
  forced redraws.
- Keep OSC 52 clipboard handling scoped to decoded clipboard content.

Reference:

- `frontend/src/shared/components/TerminalView.tsx`
- `frontend/src/shared/core/socket.ts`
- `frontend/src/routes/mobile/components/*`

## Styling

The project uses Tailwind CSS utilities and semantic CSS variables.

Preferred tokens:

- `bg-canvas`
- `bg-surface`
- `bg-surface-highlight`
- `border-theme-border`
- `text-text-primary`
- `text-text-secondary`
- `bg-accent`
- `text-error`, `text-warning`, `text-success`

Theme variables are defined in `frontend/src/index.css` and mapped in
`frontend/tailwind.config.js`. Prefer semantic tokens over raw color classes for
shared desktop/mobile surfaces.

Raw colors still exist in older or specialized surfaces such as the auth screen
and mobile session picker. Match local style when making a small patch; do not
perform broad visual rewrites during unrelated work.

## Accessibility And Interaction

Current patterns:

- Icon buttons generally include `title` attributes.
- Auth input has an `aria-label`.
- Destructive actions use `confirm(...)`.
- Interactive list rows call `stopPropagation()` on nested buttons.
- Mobile controls use larger touch targets and safe-area padding.

When adding controls:

- Keep keyboard focus behavior intact for terminal input.
- Do not let nested buttons trigger parent row selection.
- Use disabled states while async actions are in progress.
- Roll back optimistic UI updates on API failure.

## Common Mistakes

- Reimplementing API calls with ad hoc `fetch`.
- Adding terminal keyboard shortcuts without checking IME/mobile paths.
- Using raw backend field names inconsistently with `api.ts`.
- Updating desktop behavior and forgetting the mobile shell or shared session
  picker.
- Styling new shared UI with a one-off palette instead of semantic theme tokens.
