import { create } from 'zustand';

export type ModifierKey = 'ctrl' | 'alt' | 'shift';
export type KeyState = 'idle' | 'latched' | 'locked';

interface KeyboardState {
  modifiers: Record<ModifierKey, KeyState>;
  toggleModifier: (key: ModifierKey) => void;
  consumeModifiers: () => void;
  resetAll: () => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  modifiers: {
    ctrl: 'idle',
    alt: 'idle',
    shift: 'idle',
  },
  toggleModifier: (key) =>
    set((state) => {
      const current = state.modifiers[key];
      let next: KeyState = 'idle';
      if (current === 'idle') next = 'latched';
      else if (current === 'latched') next = 'locked';
      else if (current === 'locked') next = 'idle';

      return {
        modifiers: {
          ...state.modifiers,
          [key]: next,
        },
      };
    }),
  consumeModifiers: () =>
    set((state) => {
      const nextModifiers = { ...state.modifiers };
      let changed = false;
      (Object.keys(nextModifiers) as ModifierKey[]).forEach((key) => {
        if (nextModifiers[key] === 'latched') {
          nextModifiers[key] = 'idle';
          changed = true;
        }
      });
      return changed ? { modifiers: nextModifiers } : {};
    }),
  resetAll: () =>
    set({
      modifiers: { ctrl: 'idle', alt: 'idle', shift: 'idle' },
    }),
}));
