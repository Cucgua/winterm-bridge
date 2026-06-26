import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translations, Language, TranslationKey } from './translations';

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

// Detect browser language
function detectLanguage(): Language {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      language: detectLanguage(),

      setLanguage: (lang) => set({ language: lang }),

      t: (key, params) => {
        const { language } = get();
        let text: string = translations[language][key] || translations.en[key] || key;

        // Replace parameters like {n} with actual values
        if (params) {
          Object.entries(params).forEach(([paramKey, value]) => {
            text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
          });
        }

        return text;
      },
    }),
    {
      name: 'winterm-i18n',
      partialize: (state) => ({ language: state.language }),
    }
  )
);

// Helper hook for formatting relative time with i18n
export function formatRelativeTimeI18n(dateStr: string, t: I18nState['t']): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return t('time_just_now');
  if (diffSec < 3600) return t('time_minutes_ago', { n: Math.floor(diffSec / 60) });
  if (diffSec < 86400) return t('time_hours_ago', { n: Math.floor(diffSec / 3600) });
  return t('time_days_ago', { n: Math.floor(diffSec / 86400) });
}
