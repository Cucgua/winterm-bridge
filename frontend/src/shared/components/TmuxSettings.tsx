import React, { useState, useMemo } from 'react';
import { TmuxConfig } from '../core/api';
import { useI18n } from '../i18n';
import { TerminalBackgroundSettings } from '../utils/terminalBackground';

interface TmuxSettingsProps {
  config: TmuxConfig;
  onChange: (config: TmuxConfig) => void;
  terminalBackground: TerminalBackgroundSettings;
  onTerminalBackgroundChange: (settings: TerminalBackgroundSettings) => void;
  warnings?: string[];
}

type ViewMode = 'settings' | 'json';

// Toggle Switch Component
const Toggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  warning?: string;
  warningCondition?: boolean;
}> = ({ checked, onChange, label, description, warning, warningCondition }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1 min-w-0 pr-4">
      <div className="font-medium text-white">{label}</div>
      {description && <div className="text-sm text-gray-400">{description}</div>}
      {warning && warningCondition && (
        <div className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {warning}
        </div>
      )}
    </div>
    <button
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-purple-500' : 'bg-gray-700'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'left-7' : 'left-1'
        }`}
      />
    </button>
  </div>
);

export const TmuxSettings: React.FC<TmuxSettingsProps> = ({
  config,
  onChange,
  terminalBackground,
  onTerminalBackgroundChange,
  warnings,
}) => {
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('settings');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonValue, setJsonValue] = useState('');

  // Sync JSON value when switching to JSON view
  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'json') {
      setJsonValue(JSON.stringify(config, null, 2));
      setJsonError(null);
    }
    setViewMode(mode);
  };

  // Apply JSON changes
  const handleJsonApply = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      onChange(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  // Formatted JSON for display
  const formattedJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

  return (
    <div className="space-y-4">
      {/* View Mode Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        <button
          onClick={() => handleViewModeChange('settings')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            viewMode === 'settings'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          {t('tmux_view_settings')}
        </button>
        <button
          onClick={() => handleViewModeChange('json')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            viewMode === 'json'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          JSON
        </button>
      </div>

      {viewMode === 'settings' ? (
        <div className="space-y-6">
          {/* Common Settings */}
          <div className="bg-gray-800/50 p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {t('tmux_group_common')}
            </h3>

            <Toggle
              checked={config.mouse}
              onChange={() => onChange({ ...config, mouse: !config.mouse })}
              label={t('tmux_mouse_enable')}
              description={t('tmux_mouse_desc')}
              warning={t('tmux_mouse_warning')}
              warningCondition={!config.mouse}
            />

            <Toggle
              checked={config.set_clipboard}
              onChange={() => onChange({ ...config, set_clipboard: !config.set_clipboard })}
              label={t('tmux_clipboard_enable')}
              description={t('tmux_clipboard_desc')}
              warning={t('tmux_clipboard_warning')}
              warningCondition={config.set_clipboard}
            />

            <Toggle
              checked={config.status}
              onChange={() => onChange({ ...config, status: !config.status })}
              label={t('tmux_status_bar')}
              description={t('tmux_status_bar_desc')}
            />

            <Toggle
              checked={config.right_click_menu}
              onChange={() => onChange({ ...config, right_click_menu: !config.right_click_menu })}
              label={t('tmux_right_click_menu')}
              description={t('tmux_right_click_menu_desc')}
            />

            <Toggle
              checked={config.set_titles}
              onChange={() => onChange({ ...config, set_titles: !config.set_titles })}
              label={t('tmux_titles_enable')}
              description={t('tmux_titles_desc')}
            />

            {/* Title String Format */}
            {config.set_titles && (
              <div className="pl-4 border-l-2 border-purple-500/30">
                <label className="block text-sm text-gray-400 mb-1">{t('tmux_title_format')}</label>
                <input
                  type="text"
                  value={config.set_titles_string}
                  onChange={(e) => onChange({ ...config, set_titles_string: e.target.value })}
                  placeholder="#S:#W"
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <p className="mt-1 text-xs text-gray-500">#S=session, #W=window, #T=pane title</p>
              </div>
            )}
          </div>

          <div className="bg-gray-800/50 p-4 rounded-xl space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {t('terminal_background_group')}
            </h3>

            <Toggle
              checked={terminalBackground.enabled}
              onChange={() => onTerminalBackgroundChange({ ...terminalBackground, enabled: !terminalBackground.enabled })}
              label={t('terminal_background_enable')}
              description={t('terminal_background_desc')}
            />

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('terminal_background_url')}</label>
              <input
                type="text"
                value={terminalBackground.imageUrl}
                onChange={(e) => onTerminalBackgroundChange({ ...terminalBackground, imageUrl: e.target.value })}
                placeholder={t('terminal_background_url_placeholder')}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onTerminalBackgroundChange({ ...terminalBackground, enabled: false, imageUrl: '' })}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
              >
                {t('terminal_background_clear')}
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('terminal_background_opacity')}: {Math.round(terminalBackground.opacity * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(terminalBackground.opacity * 100)}
                onChange={(e) => onTerminalBackgroundChange({ ...terminalBackground, opacity: parseInt(e.target.value) / 100 })}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('terminal_background_overlay')}: {Math.round(terminalBackground.overlayOpacity * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(terminalBackground.overlayOpacity * 100)}
                onChange={(e) => onTerminalBackgroundChange({ ...terminalBackground, overlayOpacity: parseInt(e.target.value) / 100 })}
                className="w-full accent-purple-500"
              />
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/30 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-sm font-medium">{t('tmux_group_advanced')}</span>
            <svg
              className={`w-5 h-5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Advanced Settings (Collapsible) */}
          {showAdvanced && (
            <div className="space-y-4">
              {/* Buffer & Performance */}
              <div className="bg-gray-800/50 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase">{t('tmux_group_buffer')}</h4>

                {/* History Limit */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('tmux_history_limit')}</label>
                  <input
                    type="number"
                    min={1000}
                    max={100000}
                    step={1000}
                    value={config.history_limit}
                    onChange={(e) => onChange({ ...config, history_limit: parseInt(e.target.value) || 50000 })}
                    className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                  <p className="mt-1 text-xs text-yellow-400/70">{t('tmux_history_warning')}</p>
                </div>

                {/* Scroll Speed */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('tmux_scroll_speed')}: {config.scroll_speed}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={config.scroll_speed}
                    onChange={(e) => onChange({ ...config, scroll_speed: parseInt(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                </div>

                {/* Escape Time */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('tmux_escape_time')}: {config.escape_time}ms
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={config.escape_time}
                    onChange={(e) => onChange({ ...config, escape_time: parseInt(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                </div>

                <Toggle
                  checked={config.aggressive_resize}
                  onChange={() => onChange({ ...config, aggressive_resize: !config.aggressive_resize })}
                  label={t('tmux_aggressive_resize')}
                  description={t('tmux_aggressive_resize_desc')}
                />
              </div>

              {/* Window & Pane */}
              <div className="bg-gray-800/50 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase">{t('tmux_group_window')}</h4>

                {/* Base Index */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">{t('tmux_base_index')}</div>
                    <div className="text-xs text-gray-400">{t('tmux_base_index_desc')}</div>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1].map((val) => (
                      <button
                        key={val}
                        onClick={() => onChange({ ...config, base_index: val })}
                        className={`w-10 h-8 rounded text-sm font-medium transition-colors ${
                          config.base_index === val
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pane Base Index */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">{t('tmux_pane_base_index')}</div>
                    <div className="text-xs text-gray-400">{t('tmux_pane_base_index_desc')}</div>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1].map((val) => (
                      <button
                        key={val}
                        onClick={() => onChange({ ...config, pane_base_index: val })}
                        className={`w-10 h-8 rounded text-sm font-medium transition-colors ${
                          config.pane_base_index === val
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <Toggle
                  checked={config.renumber_windows}
                  onChange={() => onChange({ ...config, renumber_windows: !config.renumber_windows })}
                  label={t('tmux_renumber_windows')}
                  description={t('tmux_renumber_windows_desc')}
                />
              </div>

              {/* Integration */}
              <div className="bg-gray-800/50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-medium text-gray-500 uppercase">{t('tmux_group_integration')}</h4>

                <Toggle
                  checked={config.focus_events}
                  onChange={() => onChange({ ...config, focus_events: !config.focus_events })}
                  label={t('tmux_focus_events')}
                  description={t('tmux_focus_events_desc')}
                />
              </div>

              {/* Notifications */}
              <div className="bg-gray-800/50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-medium text-gray-500 uppercase">{t('tmux_group_notifications')}</h4>

                <Toggle
                  checked={config.monitor_activity}
                  onChange={() => onChange({ ...config, monitor_activity: !config.monitor_activity })}
                  label={t('tmux_monitor_activity')}
                  description={t('tmux_monitor_activity_desc')}
                />

                <Toggle
                  checked={config.visual_activity}
                  onChange={() => onChange({ ...config, visual_activity: !config.visual_activity })}
                  label={t('tmux_visual_activity')}
                  description={t('tmux_visual_activity_desc')}
                />

                <Toggle
                  checked={config.visual_bell}
                  onChange={() => onChange({ ...config, visual_bell: !config.visual_bell })}
                  label={t('tmux_visual_bell')}
                  description={t('tmux_visual_bell_desc')}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* JSON Editor View */
        <div className="space-y-3">
          <textarea
            value={jsonValue}
            onChange={(e) => {
              setJsonValue(e.target.value);
              setJsonError(null);
            }}
            className="w-full h-80 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-green-400 font-mono text-sm focus:outline-none focus:border-purple-500 resize-none"
            spellCheck={false}
          />
          {jsonError && (
            <p className="text-sm text-red-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {jsonError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleJsonApply}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm transition-colors"
            >
              {t('tmux_apply_json')}
            </button>
            <button
              onClick={() => setJsonValue(formattedJson)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              {t('tmux_reset_json')}
            </button>
          </div>
        </div>
      )}

      {/* Warnings Display */}
      {warnings && warnings.length > 0 && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-400 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
