# Specs: Mobile UX Enhancement

## Spec 1: Display Mode Management

### Type Definitions

```typescript
// frontend/src/shared/stores/settingsStore.ts

export type DisplayMode = 'fit' | 'fixed';

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface DisplaySettings {
  displayMode: DisplayMode;
  fixedTerminalSize: TerminalSize;
  zoomLevel: number;
  panOffset: { x: number; y: number };
}

// Default values
const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  displayMode: 'fit',
  fixedTerminalSize: { cols: 100, rows: 30 },
  zoomLevel: 1.0,
  panOffset: { x: 0, y: 0 },
};
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                      Display Mode                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    toggle()    ┌───────────┐                │
│  │   fit    │ ◄────────────► │   fixed   │                │
│  └──────────┘                └───────────┘                 │
│       │                            │                        │
│       │ FitAddon.fit()            │ Skip FitAddon          │
│       │ cols/rows = auto          │ cols/rows = 100x30     │
│       │ transform = none          │ transform = scale/pan  │
│       ▼                            ▼                        │
│  ┌──────────────────────────────────────────────┐          │
│  │           socket.sendResize(cols, rows)       │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Spec 2: Touch Gesture Handling

### Gesture Priority Matrix

| Gesture | Condition | Action | Conflict Resolution |
|---------|-----------|--------|---------------------|
| Single tap | duration < 300ms, distance < 10px | (No action - removed) | - |
| Vertical swipe | deltaY > 10px | Scroll history | Block if pinching |
| Pinch (2 finger) | displayMode = fixed | Zoom in/out | Block scroll |
| Drag (1 finger) | displayMode = fixed, zoomLevel > 1 | Pan viewport | Block scroll |

### Inertia Scroll Algorithm

```typescript
// Pseudo-code for inertia scroll

interface InertiaState {
  velocity: number;      // px/ms
  lastTimestamp: number;
  animationId: number | null;
}

const DECAY = 0.95;
const MIN_VELOCITY = 0.1;
const PX_PER_LINE = 18;

function startInertia(initialVelocity: number) {
  const animate = (timestamp: number) => {
    const delta = timestamp - state.lastTimestamp;
    state.lastTimestamp = timestamp;

    // Calculate scroll amount
    const scrollPx = state.velocity * delta;
    const scrollLines = Math.round(scrollPx / PX_PER_LINE);

    if (scrollLines !== 0) {
      term.scrollLines(state.velocity > 0 ? -scrollLines : scrollLines);
    }

    // Apply decay
    state.velocity *= DECAY;

    // Continue or stop
    if (Math.abs(state.velocity) > MIN_VELOCITY) {
      state.animationId = requestAnimationFrame(animate);
    } else {
      state.animationId = null;
    }
  };

  state.animationId = requestAnimationFrame(animate);
}

function stopInertia() {
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}
```

---

## Spec 3: Input Control State Machine

### States

```
┌─────────────────────────────────────────────────────────────┐
│                   Input Control States                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐   user clicks    ┌───────────────┐           │
│  │  idle    │  "Input" button  │   focusing    │           │
│  │          │ ────────────────►│               │           │
│  └──────────┘                  └───────────────┘           │
│       ▲                              │                      │
│       │                              │ system keyboard      │
│       │                              │ appears              │
│       │                              ▼                      │
│       │  user clicks          ┌───────────────┐            │
│       │  "Close" button       │    active     │            │
│       │◄──────────────────────│               │            │
│       │                       └───────────────┘            │
│       │                              │                      │
│       │  system dismisses            │                      │
│       │  keyboard (gesture)          │                      │
│       │◄─────────────────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// VirtualKeyboardAccessory.tsx

interface InputControlProps {
  isKeyboardActive: boolean;
  onInputToggle: () => void;
}

const InputControlButton: React.FC<InputControlProps> = ({
  isKeyboardActive,
  onInputToggle,
}) => (
  <button
    onClick={onInputToggle}
    className={clsx(
      'px-3 py-3 min-h-[44px] border-l border-gray-700',
      isKeyboardActive
        ? 'bg-green-600 text-white'
        : 'bg-gray-800 text-gray-300'
    )}
    aria-label={isKeyboardActive ? 'Close keyboard' : 'Open keyboard'}
  >
    {isKeyboardActive ? '⌨️✕' : '⌨️'}
  </button>
);
```

---

## Spec 4: CSS Transform Zoom Container

### Structure

```tsx
<ZoomableTerminalContainer>
  <div
    className="zoom-container"
    style={{
      transform: `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`,
      transformOrigin: 'top left',
    }}
  >
    <TerminalView
      fixedSize={displayMode === 'fixed' ? { cols: 100, rows: 30 } : undefined}
      ...
    />
  </div>
</ZoomableTerminalContainer>
```

### Zoom Constraints

```typescript
const ZOOM_CONSTRAINTS = {
  min: 0.5,
  max: 2.0,
  step: 0.1,
  default: 1.0,
};

// Pan is only active when zoomed in
const isPanEnabled = zoomLevel > 1.0;

// Calculate pan boundaries based on zoom level and container size
const getPanBounds = (containerSize, terminalSize, zoomLevel) => {
  const scaledWidth = terminalSize.width * zoomLevel;
  const scaledHeight = terminalSize.height * zoomLevel;

  return {
    minX: Math.min(0, containerSize.width - scaledWidth),
    maxX: 0,
    minY: Math.min(0, containerSize.height - scaledHeight),
    maxY: 0,
  };
};
```

---

## Spec 5: File Modifications Summary

| File | Modification Type | Description |
|------|-------------------|-------------|
| `MobileTerminalHandler.ts` | Edit | Remove auto-focus, add inertia scroll |
| `VirtualKeyboardAccessory.tsx` | Edit | Add Input button, Mode toggle button |
| `MobileApp.tsx` | Edit | Add input state management, display mode integration |
| `TerminalView.tsx` | Edit | Add fixedSize prop support |
| `settingsStore.ts` | Edit | Add displayMode, zoomLevel, panOffset |
| `ZoomableTerminalContainer.tsx` | New | Zoom/pan container with gesture handling |
| `DisplayModeContext.tsx` | New | Display mode state context |

---

## Spec 6: Backend Considerations

### Resize Message Protocol

Current protocol (ttyd format):
```
Prefix: '1' (0x31)
Payload: JSON { columns: number, rows: number }
```

No backend changes required. Frontend sends correct size based on display mode:
- **fit mode**: FitAddon calculated size
- **fixed mode**: Always 100x30

### Multi-client Scenario

When mobile in fixed mode (100x30) and desktop in fit mode (e.g., 150x50):
- tmux uses `window-size latest` - last resize wins
- This may cause content reflow between clients

**Mitigation**: Document this behavior; consider per-session size tracking in future.

---

## Spec 7: Confirmed Constraints (User Decisions)

| Decision Point | Confirmed Value | Rationale |
|----------------|-----------------|-----------|
| Fixed mode terminal size | 100x30 | Approximates 1920x1080 / 4 window |
| Screen rotation behavior | Always 100x30 | No recalculation on rotation |
| Single-finger gesture (zoom > 1) | Scroll priority | Scroll history, not pan |
| Zoom interaction | Pinch zoom + drag pan | Natural map-like experience |
| Inertia decay coefficient | 0.95 | Default, smooth feeling |
| Max inertia velocity | 2 px/ms | Prevent runaway scrolling |
| Inertia stop threshold | 0.1 px/ms | Minimal jitter |
| Input method control | Explicit button | No auto-focus on tap |

---

## Spec 8: Property-Based Testing (PBT) Properties

### P1: Viewport Containment
- **INVARIANT**: For any zoom level S and pan (X,Y), the rendered viewport V must be contained within content bounds C
- **BOUNDARY**: S=1.0 (fit), S=2.0 (max zoom), content < container
- **FALSIFICATION**: Generate random Pan→Zoom→Pan sequences, check for "white edges" or content overflow

### P2: Mode Switching Idempotency
- **INVARIANT**: Fixed→Fit→Fixed returns to equivalent state (ε<0.01), grid always 100x30
- **BOUNDARY**: Rapid switching, switch during inertia, switch with keyboard visible
- **FALSIFICATION**: Generate random switch frequency, verify scale/translation don't drift

### P3: Kinetic Energy Convergence
- **INVARIANT**: Inertia velocity v(t+1) = v(t) × 0.95, v(t) ≤ 2px/ms, stops when v < 0.1
- **BOUNDARY**: v0=100 (extreme), v0=0.11 (threshold), v0=-2.0 (reverse max)
- **FALSIFICATION**: High-frequency touch events generating abnormal velocity, verify clamping and convergence

### P4: Gesture State Exclusivity
- **INVARIANT**: At any time t, system in exactly one state: Idle | Scrolling | Zooming | Panning
- **BOUNDARY**: 2-finger simultaneous vs sequential, finger lift during pinch, finger distance <10px
- **FALSIFICATION**: Generate TouchEvent stream with rapid finger count changes, verify no dual-callback

### P5: Input Layout Stability
- **INVARIANT**: Keyboard appearance/disappearance never changes term.rows (30) or term.cols (100) in fixed mode
- **BOUNDARY**: Rotation + keyboard, emoji panel switch, cursor at last row
- **FALSIFICATION**: Monitor resize events, assert rows/cols unchanged, no content reflow

### P6: Coordinate Mapping Reversibility
- **INVARIANT**: screen→grid→screen mapping is reversible within 0.5 cell tolerance
- **BOUNDARY**: Screen edges, max zoom clicks, CJK double-width characters
- **FALSIFICATION**: Random screen positions, verify grid→screen reverse mapping accuracy

---

## Spec 9: Integration Conflict Resolution

| Conflict | Location | Resolution |
|----------|----------|------------|
| Raw touch listeners vs @use-gesture | `MobileTerminalHandler.ts` | Replace raw events with unified @use-gesture handlers |
| FitAddon auto-call | `TerminalView.tsx` | Add fixedSize prop check to skip fit() |
| Auto-focus on touchend | `MobileTerminalHandler.ts:125` | Remove entirely (R4) |
| CSS transform vs touch coordinates | Gesture handlers | Apply inverse transform to screen coordinates |

---

## Spec 10: Implementation Checklist

### Phase 1: Input Control (P0)
- [ ] Remove `term.focus()` and `textarea.focus()` from touchend handler
- [ ] Add Input button to VirtualKeyboardAccessory
- [ ] Implement input state toggle with viewport.keyboardVisible sync
- [ ] Verify IME composition still works
- [ ] Test on iOS Safari and Android Chrome

### Phase 2: Inertia Scroll (P1)
- [ ] Record touchmove velocity (px/ms)
- [ ] Implement RAF-based inertia animation with decay 0.95
- [ ] Cap max velocity at 2px/ms, stop at 0.1px/ms
- [ ] Interrupt on touchstart
- [ ] Verify 60fps performance

### Phase 3: Display Modes (P2)
- [ ] Extend settingsStore with displayMode, fixedSize, zoomLevel, panOffset
- [ ] Create ZoomableTerminalContainer with CSS transform
- [ ] Integrate @use-gesture for pinch zoom and drag pan
- [ ] Modify TerminalView to accept fixedSize prop
- [ ] Add mode toggle button to VirtualKeyboardAccessory
- [ ] Verify fixed mode sends 100x30 resize only once
- [ ] Test screen rotation in fixed mode (should stay 100x30)

### Phase 4: Testing
- [ ] Write PBT tests for all 6 properties
- [ ] Cross-platform testing (iOS Safari, Android Chrome, iPad)
- [ ] Performance profiling (zoom/pan/scroll)
- [ ] Memory leak check (event listener cleanup)
