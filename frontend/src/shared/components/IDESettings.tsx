import React, { useState } from 'react';
import { api, IDEConfig } from '../core/api';
import { useI18n } from '../i18n';

interface IDESettingsProps {
  config: IDEConfig;
  onChange: (config: IDEConfig) => void;
}

const FIELD_OPTIONS = [
  { key: 'project', labelKey: 'ide_field_project' as const },
  { key: 'projectPath', labelKey: 'ide_field_project_path' as const },
  { key: 'openFiles', labelKey: 'ide_field_open_files' as const },
  { key: 'currentFunction', labelKey: 'ide_field_current_function' as const },
];

export const IDESettings: React.FC<IDESettingsProps> = ({ config, onChange }) => {
  const { t } = useI18n();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await api.testIDEConnection(config.endpoint);
      if (result.ok) {
        setTestStatus('success');
        setTestMessage(t('ide_test_success').replace('{version}', result.version || '?'));
      } else {
        setTestStatus('failed');
        setTestMessage(result.error || t('ide_test_failed'));
      }
    } catch {
      setTestStatus('failed');
      setTestMessage(t('ide_test_failed'));
    }
  };

  const toggleField = (field: string) => {
    const fields = config.show_fields || [];
    const newFields = fields.includes(field)
      ? fields.filter(f => f !== field)
      : [...fields, field];
    onChange({ ...config, show_fields: newFields });
  };

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">{t('ide_enable')}</label>
          <p className="text-xs text-gray-400 mt-0.5">{t('ide_enable_desc')}</p>
        </div>
        <button
          onClick={() => onChange({ ...config, enabled: !config.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-purple-600' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Endpoint */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{t('ide_endpoint')}</label>
        <p className="text-xs text-gray-500 mb-1.5">{t('ide_endpoint_desc')}</p>
        <input
          type="text"
          value={config.endpoint}
          onChange={e => onChange({ ...config, endpoint: e.target.value })}
          placeholder="http://localhost:63888"
          className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Test Connection */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTestConnection}
          disabled={testStatus === 'testing' || !config.endpoint}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-sm text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {testStatus === 'testing' && (
            <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full" />
          )}
          {t('ide_test')}
        </button>
        {testMessage && (
          <span className={`text-xs ${testStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {testMessage}
          </span>
        )}
      </div>

      {/* Poll Interval */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{t('ide_poll_interval')}</label>
        <p className="text-xs text-gray-500 mb-1.5">{t('ide_poll_interval_desc')}</p>
        <input
          type="number"
          min={1}
          max={60}
          value={config.poll_interval}
          onChange={e => onChange({ ...config, poll_interval: Math.max(1, parseInt(e.target.value) || 5) })}
          className="w-24 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Show Fields */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{t('ide_show_fields')}</label>
        <div className="space-y-2">
          {FIELD_OPTIONS.map(({ key, labelKey }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(config.show_fields || []).includes(key)}
                onChange={() => toggleField(key)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-300">{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Copy Template */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{t('ide_copy_template')}</label>
        <p className="text-xs text-gray-500 mb-1.5">{t('ide_copy_template_desc')}</p>
        <textarea
          value={config.copy_template}
          onChange={e => onChange({ ...config, copy_template: e.target.value })}
          rows={4}
          placeholder={'Project: {project.name}\nPath: {project.basePath}\nFile: {currentFile}\nFunction: {currentFunction.signature}'}
          className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none font-mono"
        />
      </div>
    </div>
  );
};
