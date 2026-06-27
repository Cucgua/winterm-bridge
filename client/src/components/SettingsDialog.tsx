import { useEffect, useState, type ReactNode } from 'react';
import { api, AIConfig, AutoConfig, EmailConfig, IDEConfig, TmuxConfig, UploadConfig } from '../core/api';
import { TranslationKey } from '../i18n/translations';
import { useI18n } from '../i18n/i18nStore';
import { useSettingsStore } from '../stores/settingsStore';
import { THEME_DEFINITIONS, THEME_IDS } from '../utils/themeRegistry';

interface Props {
  onClose: () => void;
  variant?: 'modal' | 'page' | 'embedded';
}

type Tab = 'appearance' | 'ai' | 'auto' | 'email' | 'tmux' | 'upload' | 'ide';

const settingsTabs: Array<{ key: Tab; labelKey: TranslationKey }> = [
  { key: 'appearance', labelKey: 'appearance' },
  { key: 'ai', labelKey: 'ai_settings_title' },
  { key: 'auto', labelKey: 'auto_settings_title' },
  { key: 'email', labelKey: 'email_settings_title' },
  { key: 'tmux', labelKey: 'tmux_settings_title' },
  { key: 'upload', labelKey: 'upload_settings_title' },
  { key: 'ide', labelKey: 'ide_settings_title' },
];

const inputClassName = 'h-12 w-full rounded-xl border border-theme-border/10 bg-surface-highlight/25 px-4 text-base text-text-primary/95 outline-none transition-colors placeholder:text-text-tertiary/40 focus:border-accent';
const fieldLabelClassName = 'text-sm font-semibold text-text-secondary/65';

export function SettingsDialog({ onClose, variant = 'modal' }: Props) {
  const { t, language, setLanguage } = useI18n();
  const [tab, setTab] = useState<Tab>('appearance');
  const fontSize = useSettingsStore(s => s.fontSize);
  const setFontSize = useSettingsStore(s => s.setFontSize);
  const theme = useSettingsStore(s => s.theme);
  const setTheme = useSettingsStore(s => s.setTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [autoConfig, setAutoConfig] = useState<AutoConfig | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [tmuxConfig, setTmuxConfig] = useState<TmuxConfig | null>(null);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [ideConfig, setIdeConfig] = useState<IDEConfig | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ai, auto, email, tmux, upload, ide] = await Promise.all([
          api.getAIConfig(),
          api.getAutoConfig(),
          api.getEmailConfig(),
          api.getTmuxConfig(),
          api.getUploadConfig(),
          api.getIDEConfig(),
        ]);
        setAiConfig(ai);
        setAiRunning(ai.running || false);
        setAutoConfig(auto);
        setEmailConfig(email);
        setTmuxConfig(tmux);
        setUploadConfig(upload);
        setIdeConfig(ide);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('settings_error_load'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSaveAI = async () => {
    if (!aiConfig) return;
    try {
      const result = await api.setAIConfig(aiConfig);
      setAiRunning(result.running);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleSaveAuto = async () => {
    if (!autoConfig) return;
    try {
      await api.setAutoConfig(autoConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleStopAuto = async () => {
    try {
      await api.stopAuto();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_stop'));
    }
  };

  const handleSaveEmail = async () => {
    if (!emailConfig) return;
    try {
      await api.setEmailConfig(emailConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleSaveTmux = async () => {
    if (!tmuxConfig) return;
    try {
      await api.setTmuxConfig(tmuxConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadConfig) return;
    try {
      await api.setUploadConfig(uploadConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleClearUploads = async () => {
    try {
      await api.clearUploadFiles();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_clear'));
    }
  };

  const handleSaveIDE = async () => {
    if (!ideConfig) return;
    try {
      await api.setIDEConfig(ideConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const activeTab = settingsTabs.find(item => item.key === tab) || settingsTabs[0];
  const isPage = variant === 'page';
  const isEmbedded = variant === 'embedded';

  const renderPanel = () => {
    if (tab === 'appearance') {
      return (
        <SettingsStack>
          <div className="rounded-2xl border border-theme-border/10 bg-surface-highlight/20 p-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-text-primary/95">{t('theme')}</h2>
              <p className="mt-1 text-sm font-semibold text-text-secondary/55">{t('appearance_desc')}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PreferenceButton
                active={theme === 'system'}
                title={t('theme_system')}
                detail={t('theme')}
                onClick={() => setTheme('system')}
              />
              {THEME_IDS.map(themeId => {
                const definition = THEME_DEFINITIONS[themeId];
                return (
                  <PreferenceButton
                    key={themeId}
                    active={theme === themeId}
                    title={t(`theme_${themeId}`)}
                    detail={definition.label[language]}
                    swatch={definition.cssVariables['--c-accent']}
                    onClick={() => setTheme(themeId)}
                  />
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-theme-border/10 bg-surface-highlight/20 p-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-text-primary/95">{t('language')}</h2>
              <p className="mt-1 text-sm font-semibold text-text-secondary/55">{t('appearance_desc')}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PreferenceButton
                active={language === 'zh'}
                title={t('language_zh')}
                detail="zh-CN"
                onClick={() => setLanguage('zh')}
              />
              <PreferenceButton
                active={language === 'en'}
                title={t('language_en')}
                detail="en-US"
                onClick={() => setLanguage('en')}
              />
            </div>
          </div>
        </SettingsStack>
      );
    }

    if (loading) {
      return (
        <div className="flex h-56 items-center justify-center text-sm text-text-secondary/55">
          <span className="mr-3 h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          {t('loading')}
        </div>
      );
    }

    if (tab === 'ai' && aiConfig) {
      return (
        <SettingsStack>
          <Toggle label={t('ai_enable')} checked={aiConfig.enabled} onChange={value => setAiConfig({ ...aiConfig, enabled: value })} />
          <TextField label={t('ai_endpoint')} value={aiConfig.endpoint} onChange={value => setAiConfig({ ...aiConfig, endpoint: value })} placeholder="https://api.openai.com/v1" />
          <TextField label={t('ai_api_key')} value={aiConfig.api_key} onChange={value => setAiConfig({ ...aiConfig, api_key: value })} placeholder="sk-..." type="password" />
          <TextField label={t('ai_model')} value={aiConfig.model} onChange={value => setAiConfig({ ...aiConfig, model: value })} placeholder="gpt-4" />
          <NumberField label={t('ai_lines')} value={aiConfig.lines} onChange={value => setAiConfig({ ...aiConfig, lines: value })} min={10} max={200} />
          <NumberField label={t('ai_interval')} value={aiConfig.interval} onChange={value => setAiConfig({ ...aiConfig, interval: value })} min={5} max={300} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveAI} />
          </FormActions>
        </SettingsStack>
      );
    }

    if (tab === 'auto' && autoConfig) {
      return (
        <SettingsStack>
          <WarningBand>{t('auto_warning_executes')}</WarningBand>
          <TextField label={t('auto_model')} value={autoConfig.model} onChange={value => setAutoConfig({ ...autoConfig, model: value })} placeholder="gpt-4" />
          <NumberField label={t('auto_confidence')} value={Math.round(autoConfig.confidence_min * 100)} onChange={value => setAutoConfig({ ...autoConfig, confidence_min: value / 100 })} min={50} max={100} />
          <NumberField label={t('auto_cooldown')} value={autoConfig.cooldown_ms} onChange={value => setAutoConfig({ ...autoConfig, cooldown_ms: value })} min={1000} max={30000} />
          <NumberField label={t('auto_context_lines')} value={autoConfig.context_lines} onChange={value => setAutoConfig({ ...autoConfig, context_lines: value })} min={50} max={300} />
          <TextAreaField label={t('auto_goal')} value={autoConfig.goal} onChange={value => setAutoConfig({ ...autoConfig, goal: value })} placeholder={t('auto_goal_placeholder')} />
          <TextField label={t('auto_deny_keywords')} value={autoConfig.deny_keywords.join(', ')} onChange={value => setAutoConfig({ ...autoConfig, deny_keywords: value.split(',').map(item => item.trim()).filter(Boolean) })} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveAuto} />
            <DangerButton onClick={handleStopAuto}>{t('auto_emergency_stop')}</DangerButton>
          </FormActions>
        </SettingsStack>
      );
    }

    if (tab === 'email' && emailConfig) {
      return (
        <SettingsStack>
          <Toggle label={t('email_enable')} checked={emailConfig.enabled} onChange={value => setEmailConfig({ ...emailConfig, enabled: value })} />
          <TextField label={t('email_smtp_host')} value={emailConfig.smtp_host} onChange={value => setEmailConfig({ ...emailConfig, smtp_host: value })} />
          <NumberField label={t('email_smtp_port')} value={emailConfig.smtp_port} onChange={value => setEmailConfig({ ...emailConfig, smtp_port: value })} min={1} max={65535} />
          <TextField label={t('email_username')} value={emailConfig.username} onChange={value => setEmailConfig({ ...emailConfig, username: value })} />
          <TextField label={t('email_password')} value={emailConfig.password} onChange={value => setEmailConfig({ ...emailConfig, password: value })} type="password" />
          <TextField label={t('email_from')} value={emailConfig.from_address} onChange={value => setEmailConfig({ ...emailConfig, from_address: value })} />
          <TextField label={t('email_to')} value={emailConfig.to_address} onChange={value => setEmailConfig({ ...emailConfig, to_address: value })} />
          <NumberField label={t('email_notify_delay')} value={emailConfig.notify_delay} onChange={value => setEmailConfig({ ...emailConfig, notify_delay: value })} min={0} max={3600} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveEmail} />
          </FormActions>
        </SettingsStack>
      );
    }

    if (tab === 'tmux' && tmuxConfig) {
      return (
        <SettingsStack>
          <div className="rounded-2xl border border-theme-border/10 bg-surface-highlight/20 p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <label className="text-base font-semibold text-text-primary/95">{t('settings_terminal_font_size')}</label>
              <span className="font-mono text-sm text-text-secondary/65">{fontSize}px</span>
            </div>
            <input
              type="range"
              min="8"
              max="32"
              step="1"
              value={fontSize}
              onChange={event => setFontSize(Number(event.target.value))}
              className="w-full accent-accent"
            />
            <div className="mt-4 rounded-xl border border-theme-border/10 bg-canvas px-4 py-4 font-mono text-text-secondary/75" style={{ fontSize: `${fontSize}px` }}>
              {t('settings_terminal_preview')}
            </div>
          </div>
          <Toggle label={t('tmux_mouse_enable')} checked={tmuxConfig.mouse} onChange={value => setTmuxConfig({ ...tmuxConfig, mouse: value })} />
          <Toggle label={t('tmux_status_bar')} checked={tmuxConfig.status} onChange={value => setTmuxConfig({ ...tmuxConfig, status: value })} />
          <Toggle label={t('tmux_clipboard_enable')} checked={tmuxConfig.set_clipboard} onChange={value => setTmuxConfig({ ...tmuxConfig, set_clipboard: value })} />
          <Toggle label={t('tmux_titles_enable')} checked={tmuxConfig.set_titles} onChange={value => setTmuxConfig({ ...tmuxConfig, set_titles: value })} />
          <Toggle label={t('tmux_right_click_menu')} checked={tmuxConfig.right_click_menu} onChange={value => setTmuxConfig({ ...tmuxConfig, right_click_menu: value })} />
          <NumberField label={t('tmux_history_limit')} value={tmuxConfig.history_limit} onChange={value => setTmuxConfig({ ...tmuxConfig, history_limit: value })} min={1000} max={100000} />
          <NumberField label={t('tmux_escape_time')} value={tmuxConfig.escape_time} onChange={value => setTmuxConfig({ ...tmuxConfig, escape_time: value })} min={0} max={50} />
          <NumberField label={t('tmux_scroll_speed')} value={tmuxConfig.scroll_speed} onChange={value => setTmuxConfig({ ...tmuxConfig, scroll_speed: value })} min={1} max={10} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveTmux} />
          </FormActions>
        </SettingsStack>
      );
    }

    if (tab === 'upload' && uploadConfig) {
      return (
        <SettingsStack>
          <Toggle label={t('upload_enable')} checked={uploadConfig.enabled} onChange={value => setUploadConfig({ ...uploadConfig, enabled: value })} />
          <TextField label={t('upload_dir')} value={uploadConfig.dir} onChange={value => setUploadConfig({ ...uploadConfig, dir: value })} />
          <NumberField label={t('upload_ttl')} value={uploadConfig.ttl_minutes} onChange={value => setUploadConfig({ ...uploadConfig, ttl_minutes: value })} min={0} max={14400} />
          <NumberField label={t('upload_max_size')} value={uploadConfig.max_size_mb} onChange={value => setUploadConfig({ ...uploadConfig, max_size_mb: value })} min={1} max={100} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveUpload} />
            <DangerButton onClick={handleClearUploads}>{t('upload_clear')}</DangerButton>
          </FormActions>
        </SettingsStack>
      );
    }

    if (tab === 'ide' && ideConfig) {
      return (
        <SettingsStack>
          <Toggle label={t('ide_enable')} checked={ideConfig.enabled} onChange={value => setIdeConfig({ ...ideConfig, enabled: value })} />
          <TextField label={t('ide_endpoint')} value={ideConfig.endpoint} onChange={value => setIdeConfig({ ...ideConfig, endpoint: value })} placeholder="http://localhost:63888" />
          <NumberField label={t('ide_poll_interval')} value={ideConfig.poll_interval} onChange={value => setIdeConfig({ ...ideConfig, poll_interval: value })} min={1} max={60} />
          <FormActions>
            <SaveButton label={t('save')} onClick={handleSaveIDE} />
          </FormActions>
        </SettingsStack>
      );
    }

    return <EmptyPanel />;
  };

  const rootClassName = isEmbedded
    ? 'h-full min-h-[640px] w-full rounded-2xl border border-theme-border/10'
    : isPage
      ? 'h-full w-full rounded-none border-0'
      : 'w-[940px] max-h-[88vh] rounded-2xl border border-theme-border/10';

  const content = (
    <div
      className={`${rootClassName} flex flex-col overflow-hidden bg-canvas text-text-primary/95`}
      onClick={event => event.stopPropagation()}
    >
      {!isEmbedded && (
        <header className="h-20 flex-shrink-0 border-b border-theme-border/10 bg-surface px-7">
          <div className="flex h-full items-center gap-4">
            <div className="flex h-11 min-w-[220px] items-center gap-3 rounded-2xl bg-surface-highlight/50 px-4 text-text-primary/95">
              <SettingsMark />
              <span className="truncate text-lg font-semibold">{t('settings')}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {tab === 'ai' && <StatusChip running={aiRunning} />}
              <button
                type="button"
                className="h-10 rounded-xl border border-theme-border/10 bg-surface-highlight/25 px-4 text-sm font-semibold text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
                onClick={onClose}
              >
                {isPage ? t('back') : t('settings_close')}
              </button>
            </div>
          </div>
        </header>
      )}

      {error && (
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-error/20 bg-error/10 px-7 py-3 text-sm text-error">
          <span>{error}</span>
          <button type="button" className="text-xs font-semibold underline underline-offset-4" onClick={() => setError('')}>{t('cancel')}</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className={`${isPage ? 'w-[302px]' : isEmbedded ? 'w-[244px]' : 'w-64'} flex-shrink-0 border-r border-theme-border/10 bg-sidebar px-5 py-7`}>
          <nav className="space-y-3">
            {settingsTabs.map(item => (
              <SettingsNavButton
                key={item.key}
                active={tab === item.key}
                label={t(item.labelKey)}
                tab={item.key}
                onClick={() => setTab(item.key)}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-6 py-7 md:px-8">
          <section className={isEmbedded ? 'max-w-[980px]' : 'max-w-[840px]'}>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-text-primary/95">{t(activeTab.labelKey)}</h1>
                <div className="mt-1 text-base font-semibold text-text-secondary/50">{t('settings_section')}</div>
              </div>
              {isEmbedded && tab === 'ai' && <StatusChip running={aiRunning} />}
            </div>

            <div className="rounded-2xl border border-theme-border/10 bg-surface-elevated p-6">
              {renderPanel()}
            </div>
          </section>
        </main>
      </div>
    </div>
  );

  if (isPage || isEmbedded) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm" onClick={onClose}>
      {content}
    </div>
  );
}

function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>;
}

function SettingsNavButton({ active, label, tab, onClick }: { active?: boolean; label: string; tab: Tab; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-base font-semibold transition-colors ${
        active ? 'bg-surface-highlight/55 text-text-primary/95' : 'text-text-secondary/60 hover:bg-surface-highlight/35 hover:text-text-primary/95'
      }`}
    >
      <SettingsIcon tab={tab} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function PreferenceButton({ active, title, detail, swatch, onClick }: {
  active?: boolean;
  title: string;
  detail: string;
  swatch?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[72px] items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-accent bg-accent/15 text-text-primary/95'
          : 'border-theme-border/10 bg-surface-highlight/15 text-text-secondary/70 hover:border-theme-border/20 hover:bg-surface-highlight/30 hover:text-text-primary/95'
      }`}
    >
      <span
        className="h-8 w-8 flex-shrink-0 rounded-lg border border-theme-border/10 bg-accent"
        style={swatch ? { backgroundColor: `rgb(${swatch})` } : undefined}
      />
      <span className="min-w-0">
        <span className="block truncate text-base font-bold">{title}</span>
        <span className="block truncate text-sm font-semibold text-text-secondary/55">{detail}</span>
      </span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-5 rounded-xl border border-theme-border/10 bg-surface-highlight/20 px-5 py-3">
      <span className="min-w-0 text-base font-semibold text-text-primary/95">{label}</span>
      <button
        type="button"
        aria-pressed={checked}
        className={`flex h-8 w-[58px] flex-none items-center overflow-hidden rounded-full border px-1 transition-colors ${
          checked ? 'border-accent bg-accent' : 'border-theme-border/15 bg-canvas'
        }`}
        onClick={() => onChange(!checked)}
        title={label}
      >
        <span className={`h-6 w-6 rounded-full bg-accent-foreground shadow transition-transform ${checked ? 'translate-x-[26px]' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className={fieldLabelClassName}>{label}</span>
      <input
        className={inputClassName}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block space-y-2">
      <span className={fieldLabelClassName}>{label}</span>
      <input
        className={inputClassName}
        type="number"
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        min={min}
        max={max}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className={fieldLabelClassName}>{label}</span>
      <textarea
        className={`${inputClassName} min-h-[96px] resize-none py-3`}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </label>
  );
}

function SaveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="h-11 rounded-xl bg-accent px-6 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DangerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="h-11 rounded-xl border border-error/30 bg-error/10 px-6 text-base font-semibold text-error transition-colors hover:bg-error/15"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WarningBand({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-base font-semibold text-warning">
      {children}
    </div>
  );
}

function EmptyPanel() {
  const { t } = useI18n();

  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-theme-border/10 bg-surface-highlight/15 text-sm font-semibold text-text-tertiary/40">
      {t('settings')}
    </div>
  );
}

function StatusChip({ running }: { running: boolean }) {
  const { t } = useI18n();

  return (
    <div className={`hidden h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold md:flex ${
      running
        ? 'border-success/25 bg-success/10 text-success'
        : 'border-theme-border/10 bg-surface-highlight/25 text-text-secondary/60'
    }`}
    >
      <span className={`h-2 w-2 rounded-full ${running ? 'bg-success' : 'bg-text-tertiary/40'}`} />
      {running ? t('settings_running') : t('settings_stopped')}
    </div>
  );
}

function SettingsMark() {
  return (
    <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
}

function SettingsIcon({ tab }: { tab: Tab }) {
  if (tab === 'appearance') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" /><circle cx="12" cy="12" r="4" /></svg>;
  }
  if (tab === 'ai') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /></svg>;
  }
  if (tab === 'auto') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" /></svg>;
  }
  if (tab === 'email') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8 6 8-6" /></svg>;
  }
  if (tab === 'tmux') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg>;
  }
  if (tab === 'upload') {
    return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" /></svg>;
  }
  return <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
