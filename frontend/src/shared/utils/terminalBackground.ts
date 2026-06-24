export interface TerminalBackgroundSettings {
  enabled: boolean;
  imageUrl: string;
  opacity: number;
  overlayOpacity: number;
}

export const DEFAULT_TERMINAL_BACKGROUND: TerminalBackgroundSettings = {
  enabled: false,
  imageUrl: '',
  opacity: 0.5,
  overlayOpacity: 0.55,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeTerminalBackground(settings: TerminalBackgroundSettings): TerminalBackgroundSettings {
  return {
    enabled: settings.enabled,
    imageUrl: settings.imageUrl.trim(),
    opacity: clamp(settings.opacity, 0, 1),
    overlayOpacity: clamp(settings.overlayOpacity, 0, 1),
  };
}

export function getEffectiveTerminalBackground(settings: TerminalBackgroundSettings): TerminalBackgroundSettings | null {
  const normalized = normalizeTerminalBackground(settings);
  if (!normalized.enabled || normalized.imageUrl.length === 0) {
    return null;
  }
  return normalized;
}
