import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { THEME_DEFINITIONS, ThemeId, resolveThemePreference } from '../utils/themeRegistry';

export type ResolvedTheme = ThemeId;

function getSystemPrefersDark() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Hook to manage theme application
 * - Reads theme preference from settings store
 * - Listens to system preference when theme is 'system'
 * - Applies theme registry CSS variables to document
 * - Returns resolved theme for JS consumption (e.g., xterm)
 */
export function useTheme() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    return resolveThemePreference(theme, systemPrefersDark);
  }, [theme, systemPrefersDark]);

  useEffect(() => {
    const root = document.documentElement;
    const definition = THEME_DEFINITIONS[resolvedTheme];

    root.setAttribute('data-theme-id', definition.id);
    if (definition.mode === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }

    Object.entries(definition.cssVariables).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedDefinition = THEME_DEFINITIONS[resolvedTheme];

  return {
    theme,
    setTheme,
    resolvedTheme,
    resolvedDefinition,
    isDark: resolvedDefinition.mode === 'dark',
    isLight: resolvedDefinition.mode === 'light',
  };
}

export const TERMINAL_THEMES = Object.fromEntries(
  Object.entries(THEME_DEFINITIONS).map(([id, definition]) => [id, definition.terminal]),
) as Record<ThemeId, ThemeDefinitionTerminal>;

type ThemeDefinitionTerminal = (typeof THEME_DEFINITIONS)[ThemeId]['terminal'];
