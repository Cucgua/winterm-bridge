import React, { useState, useEffect, useCallback } from 'react';
import { api, AIConfig, EmailConfig } from '../core/api';
import { useI18n } from '../i18n';

interface AISettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'ai' | 'email'>('ai');

  // AI config state
  const [config, setConfig] = useState<AIConfig>({
    enabled: false,
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api_key: '',
    model: 'qwen-turbo',
    lines: 50,
    interval: 30,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Email config state
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    enabled: false,
    smtp_host: '',
    smtp_port: 587,
    username: '',
    password: '',
    from_address: '',
    to_address: '',
    notify_delay: 60,
  });
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load config on mount
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [aiData, emailData] = await Promise.all([
        api.getAIConfig(),
        api.getEmailConfig(),
      ]);
      setConfig({
        enabled: aiData.enabled,
        endpoint: aiData.endpoint,
        api_key: aiData.api_key,
        model: aiData.model,
        lines: aiData.lines,
        interval: aiData.interval,
      });
      setIsRunning(aiData.running);
      setEmailConfig({
        enabled: emailData.enabled,
        smtp_host: emailData.smtp_host || '',
        smtp_port: emailData.smtp_port || 587,
        username: emailData.username || '',
        password: emailData.password || '',
        from_address: emailData.from_address || '',
        to_address: emailData.to_address || '',
        notify_delay: emailData.notify_delay || 60,
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
      setTestResult(null);
      setEmailTestResult(null);
    }
  }, [isOpen, loadConfig]);

  // Test AI connection
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.testAIConnection({
        endpoint: config.endpoint,
        api_key: config.api_key,
        model: config.model,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  // Test email
  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    setEmailTestResult(null);
    try {
      const result = await api.testEmail();
      setEmailTestResult(result);
    } catch (err) {
      setEmailTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Save config
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const [aiResult] = await Promise.all([
        api.setAIConfig(config),
        api.setEmailConfig(emailConfig),
      ]);
      setIsRunning(aiResult.running);
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
      <div className="w-full max-w-lg mx-4 bg-gray-900 rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{t('ai_settings_title')}</h2>
              <p className="text-xs text-gray-400">{t('ai_settings_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700/50">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('ai_settings_title')}
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'email'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('email_settings_title')}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            </div>
          ) : activeTab === 'ai' ? (
            <>
              {/* AI Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
                <div>
                  <div className="font-medium text-white">{t('ai_enable')}</div>
                  <div className="text-sm text-gray-400">{t('ai_enable_desc')}</div>
                </div>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.enabled ? 'bg-purple-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      config.enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Running status */}
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                <span className={isRunning ? 'text-green-400' : 'text-gray-400'}>
                  {isRunning ? t('ai_status_running') : t('ai_status_stopped')}
                </span>
              </div>

              {/* API Endpoint */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('ai_endpoint')}</label>
                <input
                  type="text"
                  value={config.endpoint}
                  onChange={(e) => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
                <p className="mt-1 text-xs text-gray-500">{t('ai_endpoint_desc')}</p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('ai_api_key')}</label>
                <input
                  type="password"
                  value={config.api_key}
                  onChange={(e) => setConfig(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all font-mono"
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('ai_model')}</label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
                <p className="mt-1 text-xs text-gray-500">{t('ai_model_desc')}</p>
              </div>

              {/* Lines and Interval */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('ai_lines')}</label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={config.lines}
                    onChange={(e) => setConfig(prev => ({ ...prev, lines: parseInt(e.target.value) || 50 }))}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('ai_interval')}</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={config.interval}
                    onChange={(e) => setConfig(prev => ({ ...prev, interval: parseInt(e.target.value) || 30 }))}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">{t('ai_params_desc')}</p>

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={isTesting || !config.endpoint || !config.api_key || !config.model}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  {isTesting ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                  {t('ai_test')}
                </button>
                {testResult && (
                  <span className={`text-sm ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult.ok ? t('ai_test_success') : testResult.error || t('ai_test_failed')}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Email Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
                <div>
                  <div className="font-medium text-white">{t('email_enable')}</div>
                  <div className="text-sm text-gray-400">{t('email_enable_desc')}</div>
                </div>
                <button
                  onClick={() => setEmailConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    emailConfig.enabled ? 'bg-purple-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      emailConfig.enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* SMTP Host and Port */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-2">{t('email_smtp_host')}</label>
                  <input
                    type="text"
                    value={emailConfig.smtp_host}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, smtp_host: e.target.value }))}
                    placeholder="smtp.example.com"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('email_smtp_port')}</label>
                  <input
                    type="number"
                    value={emailConfig.smtp_port}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Username and Password */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('email_username')}</label>
                  <input
                    type="text"
                    value={emailConfig.username}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('email_password')}</label>
                  <input
                    type="password"
                    value={emailConfig.password}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              {/* From and To addresses */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('email_from')}</label>
                  <input
                    type="email"
                    value={emailConfig.from_address}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, from_address: e.target.value }))}
                    placeholder="from@example.com"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('email_to')}</label>
                  <input
                    type="email"
                    value={emailConfig.to_address}
                    onChange={(e) => setEmailConfig(prev => ({ ...prev, to_address: e.target.value }))}
                    placeholder="to@example.com"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Notify Delay */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('email_notify_delay')}</label>
                <input
                  type="number"
                  min={0}
                  value={emailConfig.notify_delay}
                  onChange={(e) => setEmailConfig(prev => ({ ...prev, notify_delay: parseInt(e.target.value) || 60 }))}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
                <p className="mt-1 text-xs text-gray-500">{t('email_delay_desc')}</p>
              </div>

              {/* Test email */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestEmail}
                  disabled={isTestingEmail || !emailConfig.smtp_host || !emailConfig.to_address}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  {isTestingEmail ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  {t('email_test')}
                </button>
                {emailTestResult && (
                  <span className={`text-sm ${emailTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {emailTestResult.ok ? t('email_test_success') : emailTestResult.error || t('email_test_failed')}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700/50 bg-gray-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-medium transition-all flex items-center gap-2"
          >
            {isSaving && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
