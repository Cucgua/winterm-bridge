import React, { useState, useEffect, useCallback } from 'react';
import { api, TmuxConfig, UploadConfig, IDEConfig, SessionInfo } from '../core/api';
import { useI18n } from '../i18n';
import { TmuxSettings } from './TmuxSettings';
import { UploadSettings } from './UploadSettings';
import { IDESettings } from './IDESettings';
import { GuestAccessSettings } from './GuestAccessSettings';
import { useSettingsStore } from '../stores/settingsStore';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({ isOpen, onClose, sessions }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'terminal' | 'upload' | 'ide' | 'access'>('terminal');
  const terminalBackground = useSettingsStore((state) => state.terminalBackground);
  const setTerminalBackground = useSettingsStore((state) => state.setTerminalBackground);

  // Tmux config state
  const [tmuxConfig, setTmuxConfig] = useState<TmuxConfig>({
    // Common settings
    mouse: true,
    set_clipboard: true,
    set_titles: true,
    set_titles_string: '#S:#W',
    status: true,
    right_click_menu: false,
    // Advanced settings
    history_limit: 50000,
    escape_time: 0,
    scroll_speed: 2,
    aggressive_resize: true,
    focus_events: true,
    base_index: 0,
    pane_base_index: 0,
    renumber_windows: false,
    visual_activity: false,
    visual_bell: false,
    monitor_activity: false,
  });
  const [tmuxWarnings, setTmuxWarnings] = useState<string[]>([]);

  // Upload config state
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>({
    enabled: true,
    dir: '',
    ttl_minutes: 60,
    max_size_mb: 10,
  });

  // IDE config state
  const [ideConfig, setIdeConfig] = useState<IDEConfig>({
    enabled: false,
    endpoint: 'http://localhost:63888',
    poll_interval: 5,
    show_fields: ['project', 'openFiles', 'currentFunction'],
    copy_template: 'Project: {project.name}\nPath: {project.basePath}\nFile: {currentFile}\nFunction: {currentFunction.signature}',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load config on mount
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tmuxData, uploadData, ideData] = await Promise.all([
        api.getTmuxConfig(),
        api.getUploadConfig(),
        api.getIDEConfig(),
      ]);
      setTmuxConfig({
        // Common settings
        mouse: tmuxData.mouse ?? true,
        set_clipboard: tmuxData.set_clipboard ?? true,
        set_titles: tmuxData.set_titles ?? true,
        set_titles_string: tmuxData.set_titles_string || '#S:#W',
        status: tmuxData.status ?? true,
        right_click_menu: tmuxData.right_click_menu ?? false,
        // Advanced settings
        history_limit: tmuxData.history_limit || 50000,
        escape_time: tmuxData.escape_time ?? 0,
        scroll_speed: tmuxData.scroll_speed || 2,
        aggressive_resize: tmuxData.aggressive_resize ?? true,
        focus_events: tmuxData.focus_events ?? true,
        base_index: tmuxData.base_index ?? 0,
        pane_base_index: tmuxData.pane_base_index ?? 0,
        renumber_windows: tmuxData.renumber_windows ?? false,
        visual_activity: tmuxData.visual_activity ?? false,
        visual_bell: tmuxData.visual_bell ?? false,
        monitor_activity: tmuxData.monitor_activity ?? false,
      });
      setUploadConfig({
        enabled: uploadData.enabled ?? true,
        dir: uploadData.dir || '',
        ttl_minutes: uploadData.ttl_minutes ?? 60,
        max_size_mb: uploadData.max_size_mb || 10,
      });
      setIdeConfig({
        enabled: ideData.enabled ?? false,
        endpoint: ideData.endpoint || 'http://localhost:63888',
        poll_interval: ideData.poll_interval ?? 5,
        show_fields: ideData.show_fields || ['project', 'openFiles', 'currentFunction'],
        copy_template: ideData.copy_template || 'Project: {project.name}\nPath: {project.basePath}\nFile: {currentFile}\nFunction: {currentFunction.signature}',
      });
    } catch {
      // Use defaults on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen, loadConfig]);

  // Save config
  const handleSave = async () => {
    setIsSaving(true);
    setTmuxWarnings([]);
    try {
      const [tmuxResult] = await Promise.all([
        api.setTmuxConfig(tmuxConfig),
        api.setUploadConfig(uploadConfig),
        api.setIDEConfig(ideConfig),
      ]);
      if (tmuxResult.warnings && tmuxResult.warnings.length > 0) {
        setTmuxWarnings(tmuxResult.warnings);
        return;
      }
      onClose();
    } catch {
      // Error handling
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{t('system_settings_title')}</h2>
              <p className="text-xs text-gray-400">{t('system_settings_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700" role="tablist" aria-label="System settings tabs">
          <button
            role="tab"
            aria-selected={activeTab === 'terminal'}
            aria-controls="panel-terminal"
            id="tab-terminal"
            onClick={() => setActiveTab('terminal')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'terminal'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('tmux_settings_title')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'upload'}
            aria-controls="panel-upload"
            id="tab-upload"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('upload_settings_title')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'ide'}
            aria-controls="panel-ide"
            id="tab-ide"
            onClick={() => setActiveTab('ide')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'ide'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('ide_settings_title')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'access'}
            aria-controls="panel-access"
            id="tab-access"
            onClick={() => setActiveTab('access')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'access'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('guest_access_tab')}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            </div>
          ) : activeTab === 'terminal' ? (
            <TmuxSettings
              config={tmuxConfig}
              onChange={setTmuxConfig}
              terminalBackground={terminalBackground}
              onTerminalBackgroundChange={setTerminalBackground}
              warnings={tmuxWarnings}
            />
          ) : activeTab === 'upload' ? (
            <UploadSettings
              config={uploadConfig}
              onChange={setUploadConfig}
            />
          ) : activeTab === 'ide' ? (
            <IDESettings
              config={ideConfig}
              onChange={setIdeConfig}
            />
          ) : activeTab === 'access' ? (
            <GuestAccessSettings sessions={sessions} isVisible={activeTab === 'access'} />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
          >
            {t('cancel')}
          </button>
          {activeTab !== 'access' && (
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-medium transition-all flex items-center gap-2"
            >
              {isSaving && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>}
              {t('save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
