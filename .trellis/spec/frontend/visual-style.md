# Frontend Conventions And Visual Style

## Purpose

This document is the current working summary for WinTerm Bridge client UI work.
Use it before changing desktop surfaces such as the session selection page,
terminal top bar, settings section, terminal overlays, and modal dialogs.

The live client source is under `client/src/`. Older notes may still use
`frontend/src/`; prefer the actual `client/` tree when there is a conflict.

## Development Conventions

### Runtime Shape

- The client is a React 18 + TypeScript SPA built by Vite.
- It runs inside the Tauri desktop client and talks to a remote Go backend.
- `client/src/App.tsx` owns auth, server selection, live session tabs,
  WebSocket attach/switch behavior, and top-level page switching.
- UI components live in `client/src/components/`.
- REST contracts and API calls live in `client/src/core/api.ts`.
- WebSocket protocol handling lives in `client/src/core/socket.ts`.
- Global client state lives in Zustand stores under `client/src/stores/`.
- Browser/theme hooks live under `client/src/hooks/`.

### Component Rules

- Components are functional React components.
- Component files use `PascalCase.tsx`.
- Keep prop interfaces local unless reused across files.
- Route-shell workflow state stays in `App.tsx`; leaf components should receive
  explicit callbacks instead of importing socket/session shell state directly.
- Components may call `api` directly only when the feature is local to that
  component, such as settings forms or session/project lists.
- Destructive actions must ask for confirmation unless the backend already
  enforces a safer workflow.

### API And Type Rules

- Use the singleton `api` client from `client/src/core/api.ts`; do not add raw
  component-level `fetch` calls.
- API interfaces mirror backend JSON fields, including `snake_case`.
- Add or update TypeScript request/response interfaces in the same change as a
  backend API contract change.
- Use strict TypeScript. Do not add `as any`, `@ts-ignore`, or
  `@ts-expect-error` to bypass type problems.
- Treat caught errors defensively with `error instanceof Error`.

### State Rules

- Server state is refreshed from backend APIs; do not persist session lists,
  project lists, file content, terminal buffers, or WebSocket state.
- Use component state for loading/error/modal/form state.
- Use Zustand persisted stores only for user preferences and cross-launch
  settings such as server entries, theme, terminal font size, and terminal
  overlay width.
- When a lifecycle action changes sessions or projects, refresh or merge the
  backend list so duplicate client truth sources do not drift.
- Polling effects must clean up intervals and avoid stale IDs.

### Terminal Rules

- Treat `TerminalView` and `SocketService` as high-risk code.
- Preserve binary PTY frames as bytes and JSON text frames as control messages.
- Preserve resize, keepalive, IME, paste, clipboard, and stale-socket guards.
- Do not add toolbar actions that steal terminal focus unintentionally.
- Long-running terminal tools must render as overlays above xterm, not as
  layout-consuming flex siblings that resize the terminal container.

### Validation

For frontend changes, run from `client/`:

```bash
npm run build
```

This runs Tailwind CSS generation, TypeScript checking, and Vite build. It is a
build/type check, not a browser or Tauri smoke test.

## Product And Visual Direction

The app is a dense operational desktop tool, not a marketing site. The desired
feel is quiet, focused, and Termius-like: dark layered surfaces, compact
controls, clear live-session affordances, and low visual noise.

### Page Roles

- **Session selection page**: workspace browser. It shows projects and live
  sessions as large scan-friendly cards, with settings and server/logout access
  in navigation/top controls.
- **Terminal page**: active work surface. The top bar shows `Workspace`, live
  session tabs, a compact "all sessions" menu, `+` new session, and task tools
  such as Save as Project, Files, and AI.
- **Settings section**: configuration is a peer section inside the Workspace
  browser navigation, alongside Workspace / Projects / Sessions. Do not add a
  separate app-level settings route unless the configuration surface outgrows
  the workspace shell. Do not duplicate settings entry points inside the
  terminal work surface unless there is a strong workflow reason.

### Layout

- Prefer full-height app shells with fixed top bars and scrollable content
  regions.
- Use dense but readable spacing; cards and rows should support scanning many
  sessions/projects.
- Do not create marketing-style hero sections, decorative page cards, or
  explanatory feature copy.
- Do not put cards inside cards. Use cards for repeated items, dialogs, and
  framed tools only.
- Constrain fixed-format UI elements with stable heights/widths so hover,
  loading, long names, and status tags do not shift layout.
- Long names, paths, URLs, and session titles must truncate inside their
  container with `truncate`, `min-w-0`, and explicit width/flex constraints.
- Terminal tools such as Files, AI, Trellis, IDE context, action logs, and goal
  editors must float inside the terminal stacking context. Opening or closing a
  persistent tool must not change the terminal container's flex footprint,
  rows, or columns.

### Color And Surfaces

- Themes are data-driven through `client/src/utils/themeRegistry.ts`.
  `useTheme()` resolves the selected preference, applies CSS variables to
  `document.documentElement`, and exposes terminal palette values.
- Default to semantic theme tokens from the registry, `client/src/index.css`,
  and `client/tailwind.config.js`:
  - `bg-canvas`
  - `bg-surface`
  - `bg-surface-elevated`
  - `bg-surface-highlight`
  - `border-theme-border`
  - `text-text-primary`
  - `text-text-secondary`
  - `text-text-tertiary`
  - `bg-accent`
  - `text-accent-foreground`
  - `text-error`, `text-warning`, `text-success`
- Component-local raw palettes are not allowed for touched or new client UI.
  Raw color literals belong in `themeRegistry.ts`, semantic status utilities,
  or narrowly documented terminal/xterm palette definitions.
- Project/session card icon tiles are identity markers, not theme accents. Keep
  their stable colors centralized in `client/src/utils/workspaceIdentity.ts`
  and do not bind them to `bg-accent`, so a project/session keeps the same
  visual identity when the user switches theme.
- Never use pure black for the app canvas.
- Keep borders subtle, usually `border-theme-border/10` or weaker.
- Status colors should come from `statusColor.ts` or semantic status tokens
  unless a color is centralized in the theme registry.

### Typography

- UI text uses the system sans stack defined in `index.css`.
- Terminal content uses xterm and terminal theme settings; do not style terminal
  text through ordinary UI classes.
- Use compact headings in tool surfaces:
  - page section headings around `text-xl`
  - card titles around `text-lg`
  - labels/metadata around `text-sm` or `text-xs`
- Avoid hero-sized typography inside cards, sidebars, toolbars, and dialogs.
- Letter spacing should remain normal unless matching an existing uppercase
  metadata label.

### Shape, Elevation, And Controls

- Current UI uses rounded controls, mostly `rounded-xl` and `rounded-2xl`.
- Use `rounded-lg` for small icon buttons and compact inline controls.
- Cards may use `rounded-2xl` in the current Termius-style session/project
  grid; do not introduce larger decorative shapes.
- Elevation should be soft and functional, such as
  `shadow-[0_12px_28px_rgba(0,0,0,0.16)]` for repeated cards or `shadow-2xl`
  for menus/dialogs.
- Prefer icon buttons for tools. Every icon-only button needs a `title`.
- Use familiar controls:
  - toggle for boolean settings
  - slider/number input for numeric settings
  - segmented tabs for settings categories
  - menu button for overflow session lists
  - confirm dialog for destructive session/project actions

### Icons

- The current client uses inline SVG icons. Keep icons simple, single-weight,
  and consistent with nearby controls.
- Do not show Mac-style traffic-light window dots in app chrome; Tauri/the OS
  owns native window controls.
- When Tauri window decorations are disabled, app chrome must provide its own
  drag region plus minimize, maximize, and close controls. Keep these controls
  compact and consistent across Workspace and Terminal top bars.
- Do not show unused product labels from screenshots such as `Vault` or `SFTP`
  when they do not map to a real workflow.
- Workspace project/session card icons use stable identity colors from
  `workspaceIdentity.ts`. Chrome icons, navigation icons, and ordinary tool
  icons still inherit theme text/accent tokens.

### Motion And Interaction

- Use subtle hover/focus color transitions.
- Hover states should clarify clickability without changing layout.
- Disable async buttons while loading where repeated action would create
  duplicate sessions/projects or duplicate saves.
- Nested icon buttons inside clickable cards must call `stopPropagation()`.
- Keyboard activation for card rows should handle `Enter` and `Space`.

### Terminal Overlay Contract

- Use `TerminalOverlayHost` and `TerminalOverlayDrawer` for persistent
  terminal-side tools.
- The overlay host lives inside the terminal page's `relative` container and is
  absolutely positioned over the xterm surface.
- The drawer may be resizable, but resizing the drawer must update only the
  overlay width preference. It must not change `TerminalView` layout width.
- The drawer owns escape-to-close and close-button behavior. Avoid global
  click-outside handlers that steal terminal mouse interactions.
- Overlay content should not add an extra outer card border when the drawer
  already provides the frame.

## Good / Bad Examples

### Good: route shell owns session creation

```tsx
const handleNewTab = async () => {
  setError('');
  try {
    const { session } = await api.createSession();
    await openSession(session);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Failed to create session');
  }
};
```

### Bad: button only changes page without executing the command

```tsx
const handleNewTab = () => setView('sessions');
```

The `+` affordance means "create a new live session" in the terminal top bar. A
navigation-only handler violates the control contract.

### Good: stable, truncating card text

```tsx
<div className="min-w-0 flex-1">
  <h3 className="truncate text-lg font-bold" title={name}>{name}</h3>
  <div className="truncate text-sm text-text-secondary/60" title={path}>
    {path}
  </div>
</div>
```

### Bad: unbounded text in a fixed card

```tsx
<h3>{session.title}</h3>
<p>{session.current_path}</p>
```

Long host names and paths are normal in this product. Unbounded text will break
the scan layout.

## Pre-Completion Checklist

- [ ] UI uses the current `client/src` structure and existing shell ownership.
- [ ] API calls go through `api`, not direct `fetch`.
- [ ] New server fields are mirrored in `client/src/core/api.ts`.
- [ ] Async controls expose loading/disabled/error states where needed.
- [ ] Destructive actions require confirmation.
- [ ] Long labels/paths/session names truncate or wrap intentionally.
- [ ] Touched components use theme registry / semantic tokens rather than raw
      component-local colors.
- [ ] Terminal-side tools render through overlays and do not resize xterm.
- [ ] Terminal/socket behavior is not touched unless specifically required.
- [ ] `npm run build` passes from `client/`, or skipped validation is reported.
