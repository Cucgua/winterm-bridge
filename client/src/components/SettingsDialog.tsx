import { useEffect, useState } from 'react';
import { api, AIConfig, AutoConfig, EmailConfig, TmuxConfig, UploadConfig, IDEConfig } from '../core/api';
import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  onClose: () => void;
  variant?: 'modal' | 'page';
}

type Tab = 'ai' | 'auto' | 'email' | 'tmux' | 'upload' | 'ide';

export function SettingsDialog({ onClose, variant = 'modal' }: Props) {
  const [tab, setTab] = useState<Tab>('ai');
  const fontSize = useSettingsStore(s => s.fontSize);
  const setFontSize = useSettingsStore(s => s.setFontSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI config
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  // Auto config
  const [autoConfig, setAutoConfig] = useState<AutoConfig | null>(null);

  // Email config
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);

  // Tmux config
  const [tmuxConfig, setTmuxConfig] = useState<TmuxConfig | null>(null);

  // Upload config
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);

  // IDE config
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
        setError(e instanceof Error ? e.message : 'Failed to load settings');
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
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleSaveAuto = async () => {
    if (!autoConfig) return;
    try {
      await api.setAutoConfig(autoConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleSaveEmail = async () => {
    if (!emailConfig) return;
    try {
      await api.setEmailConfig(emailConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleSaveTmux = async () => {
    if (!tmuxConfig) return;
    try {
      await api.setTmuxConfig(tmuxConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadConfig) return;
    try {
      await api.setUploadConfig(uploadConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleSaveIDE = async () => {
    if (!ideConfig) return;
    try {
      await api.setIDEConfig(ideConfig);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const tabs: [Tab, string][] = [
    ['ai', 'AI Monitor'],
    ['auto', 'Auto Reply'],
    ['email', 'Email'],
    ['tmux', 'Terminal'],
    ['upload', 'Upload'],
    ['ide', 'IDE'],
  ];

  const isPage = variant === 'page';

  const content = (
      <div
        className={`${isPage ? 'h-full w-full rounded-none bg-[#0f1426]' : 'w-[600px] max-h-[85vh] rounded-xl bg-surface'} border border-white/10 flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-base font-bold text-text-primary/95">Settings</h2>
          <button className="text-text-secondary/60 hover:text-text-primary/95" onClick={onClose}>{isPage ? 'Back' : '✕'}</button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 shrink-0">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                tab === key ? 'bg-accent text-white' : 'text-text-secondary/60 hover:text-text-primary/95 hover:bg-white/5'
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-2 text-xs text-error border-b border-white/10">
            {error}
            <button className="ml-2 underline" onClick={() => setError('')}>dismiss</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading && <p className="text-sm text-text-secondary/60">Loading...</p>}

          {!loading && tab === 'ai' && aiConfig && (
            <div className="space-y-3">
              <Toggle label="Enable AI Monitor" checked={aiConfig.enabled} onChange={v => setAiConfig({ ...aiConfig, enabled: v })} />
              <div className="text-xs text-text-secondary/60">Status: {aiRunning ? '🟢 Running' : '⚪ Stopped'}</div>
              <TextField label="Endpoint" value={aiConfig.endpoint} onChange={v => setAiConfig({ ...aiConfig, endpoint: v })} placeholder="https://api.openai.com/v1" />
              <TextField label="API Key" value={aiConfig.api_key} onChange={v => setAiConfig({ ...aiConfig, api_key: v })} placeholder="sk-..." type="password" />
              <TextField label="Model" value={aiConfig.model} onChange={v => setAiConfig({ ...aiConfig, model: v })} placeholder="gpt-4" />
              <NumberField label="Lines" value={aiConfig.lines} onChange={v => setAiConfig({ ...aiConfig, lines: v })} min={10} max={200} />
              <NumberField label="Interval (s)" value={aiConfig.interval} onChange={v => setAiConfig({ ...aiConfig, interval: v })} min={5} max={300} />
              <SaveButton onClick={handleSaveAI} />
            </div>
          )}

          {!loading && tab === 'auto' && autoConfig && (
            <div className="space-y-3">
              <div className="text-xs text-warning">⚠ Auto-reply executes actions without user confirmation</div>
              <TextField label="Decision Model" value={autoConfig.model} onChange={v => setAutoConfig({ ...autoConfig, model: v })} placeholder="gpt-4" />
              <NumberField label="Min Confidence" value={Math.round(autoConfig.confidence_min * 100)} onChange={v => setAutoConfig({ ...autoConfig, confidence_min: v / 100 })} min={50} max={100} />
              <NumberField label="Cooldown (ms)" value={autoConfig.cooldown_ms} onChange={v => setAutoConfig({ ...autoConfig, cooldown_ms: v })} min={1000} max={30000} />
              <NumberField label="Context Lines" value={autoConfig.context_lines} onChange={v => setAutoConfig({ ...autoConfig, context_lines: v })} min={50} max={300} />
              <TextAreaField label="Goal" value={autoConfig.goal} onChange={v => setAutoConfig({ ...autoConfig, goal: v })} placeholder="What should auto-reply optimize for?" />
              <TextField label="Deny Keywords (comma-separated)" value={autoConfig.deny_keywords.join(', ')} onChange={v => setAutoConfig({ ...autoConfig, deny_keywords: v.split(',').map(s => s.trim()).filter(Boolean) })} />
              <div className="flex gap-2">
                <SaveButton onClick={handleSaveAuto} />
                <button className="px-3 py-1.5 bg-error text-white rounded text-xs hover:opacity-90" onClick={async () => { await api.stopAuto(); }}>Emergency Stop All</button>
              </div>
            </div>
          )}

          {!loading && tab === 'email' && emailConfig && (
            <div className="space-y-3">
              <Toggle label="Enable Email Notifications" checked={emailConfig.enabled} onChange={v => setEmailConfig({ ...emailConfig, enabled: v })} />
              <TextField label="SMTP Host" value={emailConfig.smtp_host} onChange={v => setEmailConfig({ ...emailConfig, smtp_host: v })} />
              <NumberField label="SMTP Port" value={emailConfig.smtp_port} onChange={v => setEmailConfig({ ...emailConfig, smtp_port: v })} min={1} max={65535} />
              <TextField label="Username" value={emailConfig.username} onChange={v => setEmailConfig({ ...emailConfig, username: v })} />
              <TextField label="Password" value={emailConfig.password} onChange={v => setEmailConfig({ ...emailConfig, password: v })} type="password" />
              <TextField label="From" value={emailConfig.from_address} onChange={v => setEmailConfig({ ...emailConfig, from_address: v })} />
              <TextField label="To" value={emailConfig.to_address} onChange={v => setEmailConfig({ ...emailConfig, to_address: v })} />
              <NumberField label="Notify Delay (s)" value={emailConfig.notify_delay} onChange={v => setEmailConfig({ ...emailConfig, notify_delay: v })} min={0} max={3600} />
              <SaveButton onClick={handleSaveEmail} />
            </div>
          )}

          {!loading && tab === 'tmux' && tmuxConfig && (
            <div className="space-y-3">
              {/* Appearance — terminal font size (local setting, no save needed) */}
              <div className="space-y-2 pb-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-text-primary/95">Terminal Font Size</label>
                  <span className="text-xs text-text-secondary/60 font-mono">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="32"
                  step="1"
                  value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="font-mono text-text-secondary/60" style={{ fontSize: `${fontSize}px` }}>
                  $ sample terminal preview — AaBb01
                </div>
              </div>
              <Toggle label="Mouse Support" checked={tmuxConfig.mouse} onChange={v => setTmuxConfig({ ...tmuxConfig, mouse: v })} />
              <Toggle label="Status Bar" checked={tmuxConfig.status} onChange={v => setTmuxConfig({ ...tmuxConfig, status: v })} />
              <Toggle label="Set Clipboard" checked={tmuxConfig.set_clipboard} onChange={v => setTmuxConfig({ ...tmuxConfig, set_clipboard: v })} />
              <Toggle label="Set Titles" checked={tmuxConfig.set_titles} onChange={v => setTmuxConfig({ ...tmuxConfig, set_titles: v })} />
              <Toggle label="Right Click Menu" checked={tmuxConfig.right_click_menu} onChange={v => setTmuxConfig({ ...tmuxConfig, right_click_menu: v })} />
              <NumberField label="History Limit" value={tmuxConfig.history_limit} onChange={v => setTmuxConfig({ ...tmuxConfig, history_limit: v })} min={1000} max={100000} />
              <NumberField label="Escape Time (ms)" value={tmuxConfig.escape_time} onChange={v => setTmuxConfig({ ...tmuxConfig, escape_time: v })} min={0} max={50} />
              <NumberField label="Scroll Speed" value={tmuxConfig.scroll_speed} onChange={v => setTmuxConfig({ ...tmuxConfig, scroll_speed: v })} min={1} max={10} />
              <SaveButton onClick={handleSaveTmux} />
            </div>
          )}

          {!loading && tab === 'upload' && uploadConfig && (
            <div className="space-y-3">
              <Toggle label="Enable Upload" checked={uploadConfig.enabled} onChange={v => setUploadConfig({ ...uploadConfig, enabled: v })} />
              <TextField label="Upload Directory" value={uploadConfig.dir} onChange={v => setUploadConfig({ ...uploadConfig, dir: v })} />
              <NumberField label="TTL (minutes)" value={uploadConfig.ttl_minutes} onChange={v => setUploadConfig({ ...uploadConfig, ttl_minutes: v })} min={0} max={14400} />
              <NumberField label="Max Size (MB)" value={uploadConfig.max_size_mb} onChange={v => setUploadConfig({ ...uploadConfig, max_size_mb: v })} min={1} max={100} />
              <div className="flex gap-2">
                <SaveButton onClick={handleSaveUpload} />
                <button className="px-3 py-1.5 bg-error text-white rounded text-xs hover:opacity-90" onClick={async () => { await api.clearUploadFiles(); }}>Clear All Files</button>
              </div>
            </div>
          )}

          {!loading && tab === 'ide' && ideConfig && (
            <div className="space-y-3">
              <Toggle label="Enable IDE Integration" checked={ideConfig.enabled} onChange={v => setIdeConfig({ ...ideConfig, enabled: v })} />
              <TextField label="IDE Endpoint" value={ideConfig.endpoint} onChange={v => setIdeConfig({ ...ideConfig, endpoint: v })} placeholder="http://localhost:63888" />
              <NumberField label="Poll Interval (s)" value={ideConfig.poll_interval} onChange={v => setIdeConfig({ ...ideConfig, poll_interval: v })} min={1} max={60} />
              <SaveButton onClick={handleSaveIDE} />
            </div>
          )}
        </div>
      </div>
  );

  if (isPage) return content;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      {content}
    </div>
  );
}

// --- Form helpers ---
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-text-primary/95">{label}</span>
      <button
        className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-accent' : 'bg-canvas border border-white/10'}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary/60">{label}</label>
      <input
        className="w-full px-3 py-1.5 bg-canvas border border-white/10 rounded text-sm text-text-primary/95 placeholder-text-secondary focus:outline-none focus:border-accent"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary/60">{label}</label>
      <input
        className="w-full px-3 py-1.5 bg-canvas border border-white/10 rounded text-sm text-text-primary/95 focus:outline-none focus:border-accent"
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary/60">{label}</label>
      <textarea
        className="w-full px-3 py-1.5 bg-canvas border border-white/10 rounded text-sm text-text-primary/95 placeholder-text-secondary focus:outline-none focus:border-accent resize-none"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="px-4 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90"
      onClick={onClick}
    >
      Save
    </button>
  );
}
