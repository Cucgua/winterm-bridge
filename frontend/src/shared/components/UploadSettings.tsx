import React, { useState } from 'react';
import { UploadConfig, api } from '../core/api';
import { useI18n } from '../i18n';

interface UploadSettingsProps {
  config: UploadConfig;
  onChange: (config: UploadConfig) => void;
}

export const UploadSettings: React.FC<UploadSettingsProps> = ({ config, onChange }) => {
  const { t } = useI18n();
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleClear = async () => {
    if (!confirm(t('upload_clear_confirm'))) return;

    setClearing(true);
    setClearResult(null);
    try {
      const result = await api.clearUploadFiles();
      if (result.deleted > 0) {
        setClearResult({ success: true, message: t('upload_clear_success').replace('{n}', String(result.deleted)) });
      } else {
        setClearResult({ success: true, message: t('upload_clear_empty') });
      }
    } catch {
      setClearResult({ success: false, message: t('upload_failed') });
    } finally {
      setClearing(false);
      setTimeout(() => setClearResult(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/50 p-4 rounded-xl space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex-1 min-w-0 pr-4">
            <div className="font-medium text-white">{t('upload_enable')}</div>
            <div className="text-sm text-gray-400">{t('upload_enable_desc')}</div>
          </div>
          <button
            onClick={() => onChange({ ...config, enabled: !config.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              config.enabled ? 'bg-purple-500' : 'bg-gray-700'
            }`}
            role="switch"
            aria-checked={config.enabled}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                config.enabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Directory */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">{t('upload_dir')}</label>
          <input
            type="text"
            value={config.dir}
            onChange={(e) => onChange({ ...config, dir: e.target.value })}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">{t('upload_dir_desc')}</p>
        </div>

        {/* TTL */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">{t('upload_ttl')}</label>
          <input
            type="number"
            min={0}
            max={14400}
            value={config.ttl_minutes}
            onChange={(e) => onChange({ ...config, ttl_minutes: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">{t('upload_ttl_desc')}</p>
        </div>

        {/* Max Size */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">{t('upload_max_size')}</label>
          <input
            type="number"
            min={1}
            max={100}
            value={config.max_size_mb}
            onChange={(e) => onChange({ ...config, max_size_mb: parseInt(e.target.value) || 10 })}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">{t('upload_max_size_desc')}</p>
        </div>

        {/* Clear Files */}
        <div className="flex items-center justify-between py-2 border-t border-gray-700 mt-4 pt-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="font-medium text-white">{t('upload_clear')}</div>
            <div className="text-sm text-gray-400">{t('upload_clear_desc')}</div>
          </div>
          <button
            onClick={handleClear}
            disabled={clearing}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors flex-shrink-0"
          >
            {clearing ? '...' : t('upload_clear')}
          </button>
        </div>

        {/* Clear Result */}
        {clearResult && (
          <div className={`text-sm px-3 py-2 rounded-lg ${clearResult.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {clearResult.message}
          </div>
        )}
      </div>
    </div>
  );
};
