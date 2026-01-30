import React, { useState } from 'react';
import { SessionInfo } from '../core/api';

interface SessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
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
  onTogglePersist,
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

  const handleTogglePersist = (e: React.MouseEvent, sessionId: string, isPersistent: boolean) => {
    e.stopPropagation();
    onTogglePersist?.(sessionId, isPersistent);
  };

  const handleCreate = () => {
    onCreate(newSessionName.trim() || undefined);
    setNewSessionName('');
  };

  // Sort sessions: persistent first, then by last_active
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.is_persistent && !b.is_persistent) return -1;
    if (!a.is_persistent && b.is_persistent) return 1;
    return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
  });

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
          {sortedSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-900 rounded-lg border border-gray-800">
              No active sessions found
            </div>
          ) : (
            sortedSessions.map((session) => (
              <div
                key={session.id}
                className={`bg-gray-900 rounded-lg p-4 transition-colors ${
                  session.is_ghost
                    ? 'border border-dashed border-gray-600 hover:border-green-600'
                    : session.is_persistent
                    ? 'border border-yellow-600/50 hover:border-green-600'
                    : 'border border-gray-800 hover:border-green-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-mono text-lg font-bold text-gray-200">
                        {session.title || `Session ${session.id.substring(0, 8)}`}
                      </h3>
                      {session.is_ghost && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">
                          idle
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        session.is_ghost
                          ? 'bg-gray-500'
                          : session.state === 'active'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}></span>
                      <span>{session.is_ghost ? 'ghost' : session.state}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(session.last_active)}</span>
                    </div>
                    {session.tmux_name && !session.is_ghost && (
                      <div className="text-xs text-gray-600 mt-2 font-mono">
                        tmux: {session.tmux_name}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Persist toggle button */}
                    <button
                      onClick={(e) => handleTogglePersist(e, session.id, !!session.is_persistent)}
                      className={`px-3 py-2 rounded transition-colors ${
                        session.is_persistent
                          ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-yellow-400'
                      }`}
                      title={session.is_persistent ? 'Remove from persistent' : 'Mark as persistent'}
                    >
                      {session.is_persistent ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      )}
                    </button>
                    {session.tmux_cmd && !session.is_ghost && (
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
                      {session.is_ghost ? 'Revive' : 'Join'}
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
