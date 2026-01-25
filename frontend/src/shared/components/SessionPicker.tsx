import React, { useState } from 'react';
import { SessionInfo } from '../core/api';

interface SessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export const SessionPicker: React.FC<SessionPickerProps> = ({
  sessions,
  onSelect,
  onCreate,
  onDelete,
  onLogout,
}) => {
  const [newSessionName, setNewSessionName] = useState('');

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      onDelete(sessionId);
    }
  };

  const handleCopyTmuxCmd = (e: React.MouseEvent, tmuxCmd: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tmuxCmd).then(() => {
      alert('Tmux command copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy: ' + tmuxCmd);
    });
  };

  const handleCreate = () => {
    onCreate(newSessionName.trim() || undefined);
    setNewSessionName('');
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Select Session</h1>
          <button
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="space-y-3 mb-6 max-h-[60vh] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-900 rounded-lg border border-gray-800">
              No active sessions found
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-green-600 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="font-mono text-lg font-bold text-gray-200">
                      {session.title || `Session ${session.id.substring(0, 8)}`}
                    </h3>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                      <span>{session.state}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(session.last_active)}</span>
                    </div>
                    {session.tmux_name && (
                      <div className="text-xs text-gray-600 mt-2 font-mono">
                        tmux: {session.tmux_name}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {session.tmux_cmd && (
                      <button
                        onClick={(e) => handleCopyTmuxCmd(e, session.tmux_cmd!)}
                        className="bg-gray-800 hover:bg-blue-600 text-gray-400 hover:text-white px-3 py-2 rounded transition-colors"
                        title="Copy tmux attach command"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white px-3 py-2 rounded transition-colors"
                      title="Delete session"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onSelect(session.id)}
                      className="bg-gray-800 hover:bg-green-600 text-gray-300 hover:text-white px-4 py-2 rounded font-medium transition-colors"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-800 pt-6 space-y-3">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="Session name (optional)"
            className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleCreate}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-colors flex items-center justify-center space-x-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>Create New Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
