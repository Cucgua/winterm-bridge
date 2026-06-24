# Frontend Hook Guidelines

## Existing Hook Boundaries

Shared hooks live in `frontend/src/shared/hooks`:

- `useTheme` reads theme preference from `useSettingsStore`, applies
  `data-theme='light'`, listens to system theme changes, and exports xterm
  theme objects.
- `useDeviceType` decides desktop/mobile routing from `?mode=`, user agent,
  viewport width, and touch support.
- `useViewport` tracks `visualViewport` size/offset and keyboard visibility.

Mobile-specific viewport and keyboard-close logic currently lives inside
`MobileShell.tsx` as `useViewportHeight` because it is tightly coupled to the
mobile shell workflow.

## Creating Hooks

Create a hook when stateful browser logic is reused or complex enough to make a
component hard to read. Keep route-specific hooks near their route until another
surface needs them.

Required patterns:

- Hook names start with `use`.
- Register browser listeners in `useEffect` and always return cleanup.
- Guard browser APIs that may be missing, such as `window.visualViewport`.
- Keep hook return values typed with interfaces when they have multiple fields.

Reference:

- `frontend/src/shared/hooks/useViewport.ts`
- `frontend/src/shared/hooks/useTheme.ts`

## Browser Event Cleanup

When adding listeners, mirror the current cleanup style:

```ts
window.visualViewport?.addEventListener('resize', handleResize);
return () => {
  window.visualViewport?.removeEventListener('resize', handleResize);
};
```

Do the same for `document`, `window`, `matchMedia`, custom events, socket
subscriptions, and timers.

Reference examples:

- `TerminalView.tsx` custom events and resize handling.
- `DesktopLayout.tsx` `copy-mode-changed` listener.
- `useTheme.ts` `matchMedia` listener.
- `MobileShell.tsx` viewport listeners.

## Data Fetching

There is no React Query/SWR layer. Data fetching is currently handled by
component effects and explicit API calls:

- Route shells load auth/session state.
- Settings panels fetch and save their own config.
- `DesktopLayout` polls IDE context based on configured interval.
- `MobileShell` polls AI summaries while selecting/running sessions.

If adding a polling hook, make the interval explicit, clean it up, and avoid
polling when the relevant surface is hidden or disabled.

## Dependency Arrays

Use stable callbacks with `useCallback` when passing handlers into effects or
child components. Include all dependencies. The TypeScript build currently
checks unused locals/parameters, but there is no eslint hook-exhaustive-deps
rule, so dependency correctness is a review responsibility.

Common mistakes:

- Creating intervals without cleanup.
- Reading stale session IDs in socket callbacks.
- Assuming `visualViewport` exists on all browsers.
- Moving mobile keyboard logic into a shared hook before desktop behavior has
  the same requirements.
