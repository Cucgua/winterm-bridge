# Frontend Component Guidelines

## Component Style

Components are functional React components. Existing shared components mostly
use named exports with `React.FC`, while route components use default function
exports for lazy loading.

Reference examples:

- `client/src/App.tsx`
- `client/src/components/SessionSelectPage.tsx`
- `client/src/components/TabBar.tsx`
- `client/src/components/TerminalView.tsx`
- `client/src/components/AuthScreen.tsx`

Follow the local file style instead of rewriting nearby components to a new
style.

## Props

Props are typed with local `interface` declarations near the component.

Local patterns:

- Callback props use explicit argument types:
  `onSwitchSession: (sessionId: string) => void`.
- Optional callbacks are marked with `?` and guarded before use.
- UI state enums are local string unions when only one component owns them, for
  example `AppView` and `DockSection` in `App.tsx`.

Avoid passing raw API response objects deep into unrelated components when a
smaller prop shape is enough. `App.tsx` is the accepted shell boundary for
session lifecycle, socket, and page switching workflows.

## API And Socket Handling In Components

The app shell owns connection and auth workflows:

- `App.tsx` validates tokens, lists and merges sessions, switches pages,
  switches servers, attaches WebSocket sessions, and handles socket control
  messages.
- `SessionSelectPage.tsx` owns its local project/session list loading, search,
  filtering, create/delete actions, and server modal UI.

Leaf components should call API methods when the feature is local to that
component or settings panel. Examples include `SessionSelectPage` loading
project/session lists and `SettingsDialog` loading settings forms.

Do not duplicate low-level fetch or WebSocket code inside UI components. Use
`api` from `client/src/core/api.ts` and `socket` / `SocketService` from
`client/src/core/socket.ts`.

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

- `client/src/components/TerminalView.tsx`
- `client/src/core/socket.ts`

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

Theme definitions live in `client/src/utils/themeRegistry.ts`, fallback CSS
variables live in `client/src/index.css`, and Tailwind token mappings live in
`client/tailwind.config.js`. Prefer semantic tokens over raw color classes for
all touched client surfaces.

Do not introduce component-local raw palettes during small patches. If an older
component still contains raw colors and must be touched visually, migrate that
surface to theme tokens or record the exception in the task inventory with a
follow-up owner.

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
