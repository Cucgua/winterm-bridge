import React, { useState, FormEvent } from 'react';
import { useI18n } from '../i18n';

interface AuthScreenProps {
  onSubmit: (pin: string) => void;
  error?: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSubmit, error }) => {
  const [pin, setPin] = useState('');
  const { t } = useI18n();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pin.length === 6) {
      onSubmit(pin);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-black text-white">
      <div className="w-full max-w-sm mx-auto p-8 py-safe">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 mb-4 shadow-lg shadow-green-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {t('app_name')}
          </h1>
        </div>

        {/* Auth form */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-800">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-medium text-white mb-1">{t('auth_title')}</h2>
              <p className="text-sm text-gray-400">{t('auth_subtitle')}</p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-4 text-center text-2xl font-mono bg-black/50 border border-gray-700 rounded-xl focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all tracking-[0.5em]"
              placeholder={t('auth_placeholder')}
              autoFocus
            />

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pin.length !== 6}
              className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all shadow-lg shadow-green-500/20 disabled:shadow-none"
            >
              {t('connect')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
