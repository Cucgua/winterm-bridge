import React, { useState, FormEvent } from 'react';

interface AuthScreenProps {
  onSubmit: (pin: string) => void;
  error?: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSubmit, error }) => {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pin.length === 6) {
      onSubmit(pin);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-gray-400 mb-4">Enter the PIN shown on the server</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-48 px-4 py-3 text-center text-2xl font-mono bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-green-500"
            placeholder="000000"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={pin.length !== 6}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
};
