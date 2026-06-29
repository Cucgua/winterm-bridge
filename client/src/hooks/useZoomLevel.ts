import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Hook to apply the user's interface zoom preference.
 *
 * Multiplies the DPI baseline (see index.html — `16 / dpr`, floored at 10px) by
 * the persisted `zoomLevel` (0.5×–2.0×) and writes the result to the root
 * element's font-size. Because the app shell is Tailwind/rem based, this scales
 * buttons, padding, labels, etc. uniformly without touching fixed-px layouts.
 *
 * The xterm terminal font is managed independently in px (TerminalView passes
 * `fontSize` straight to xterm), so it is unaffected by this — only the
 * surrounding UI scales. As in index.html, we deliberately avoid CSS zoom or
 * transform because xterm selection and pointer hit-testing depend on
 * unscaled DOM coordinates.
 */
export function useZoomLevel() {
  const zoomLevel = useSettingsStore((state) => state.zoomLevel);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const boundedDpr = dpr > 1 ? Math.min(dpr, 2) : 1;
    // Keep this baseline formula in sync with the inline script in index.html
    // so React's effect never produces a different value than the first paint.
    const baseline = Math.max(10, 16 / boundedDpr);
    document.documentElement.style.fontSize = `${baseline * zoomLevel}px`;
  }, [zoomLevel]);
}
