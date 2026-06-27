import { ReactNode } from 'react';
import { useI18n } from '../i18n';

export type NavSection = 'sessions' | 'files' | 'ai' | 'settings';

interface Props {
  activeSection: NavSection;
  aiEnabled: boolean;
  hasToken: boolean;
  serverName: string | null;
  onSectionChange: (section: NavSection) => void;
  onLogout: () => void;
}

interface NavItem {
  key: NavSection;
  label: string;
  icon: ReactNode;
  badge?: boolean;
}

/**
 * Far-left navigation rail (Termius-style activity bar).
 *
 * Deep, narrow vertical icon strip. Top cluster holds the primary feature
 * switches (Sessions / Files / AI); Settings sits at the bottom above a
 * server-status avatar. Active item is marked with an accent bar on the
 * left edge rather than a filled background, matching Termius' rail.
 */
export function ActivityBar({ activeSection, aiEnabled, hasToken, serverName, onSectionChange, onLogout }: Props) {
  const { t } = useI18n();
  const navItems: NavItem[] = [
    {
      key: 'sessions',
      label: t('nav_sessions'),
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>,
    },
    {
      key: 'files',
      label: t('files_title'),
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7l2-3h5l2 3h9v13H3z" /></svg>,
    },
    {
      key: 'ai',
      label: t('ai_settings_title'),
      badge: aiEnabled,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>,
    },
  ];

  return (
    <div className="w-12 bg-sidebar flex flex-col items-center py-3 gap-1 border-r border-theme-border/10 shrink-0">
      {navItems.map(item => {
        const isActive = activeSection === item.key;
        return (
          <button
            key={item.key}
            className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
              isActive
                ? 'text-accent'
                : 'text-text-tertiary/30 hover:text-text-primary/95 hover:bg-surface-highlight/45'
            }`}
            onClick={() => onSectionChange(item.key)}
            title={item.label}
          >
            {/* Active indicator: accent bar on the left edge */}
            {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />}
            {item.icon}
            {item.badge && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-success ring-2 ring-sidebar" />}
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Settings */}
      <button
        className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
          activeSection === 'settings'
            ? 'text-accent'
            : 'text-text-tertiary/30 hover:text-text-primary/95 hover:bg-surface-highlight/45'
        }`}
        onClick={() => onSectionChange('settings')}
        title={t('settings')}
      >
        {activeSection === 'settings' && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>
      </button>

      {/* Server status avatar / logout */}
      <button
        className="flex items-center justify-center w-10 h-10 rounded-lg text-text-tertiary/30 hover:text-error hover:bg-surface-highlight/45 transition-colors mt-1"
        onClick={onLogout}
        title={serverName ? `${serverName} - ${t('logout')}` : t('logout')}
      >
        <span className={`relative flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${hasToken ? 'bg-accent/20 text-accent' : 'bg-surface-highlight text-text-secondary/60'}`}>
          {serverName ? serverName.charAt(0).toUpperCase() : '?'}
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-sidebar ${hasToken ? 'bg-success' : 'bg-text-tertiary'}`} />
        </span>
      </button>
    </div>
  );
}
