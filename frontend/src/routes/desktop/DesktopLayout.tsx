import React, { useState } from 'react';
import { SessionInfo } from '../../shared/core/api';

interface DesktopLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onCreateSession: (title?: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function DesktopLayout({
  children,
  onLogout,
  sessions,
  currentSessionId,
  onSwitchSession,
  onCreateSession,
  onDeleteSession,
}: DesktopLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-12' : 'w-56'} border-r border-gray-800 transition-all flex flex-col`}>
        <div className="p-2 border-b border-gray-800">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '☰' : '◀'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="flex-1 p-2 overflow-y-auto">
            <div className="text-xs text-gray-500 uppercase mb-2">Sessions ({sessions.length})</div>
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded p-2 text-sm cursor-pointer transition-colors group ${
                    session.id === currentSessionId
                      ? 'bg-green-900 border border-green-700'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                  onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></span>
                      <span className="truncate">
                        {session.title || `Session ${session.id.substring(0, 6)}`}
                      </span>
                    </div>
                    {session.id !== currentSessionId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this session?')) {
                            onDeleteSession(session.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-500 p-1 transition-opacity"
                        title="Delete session"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {session.id === currentSessionId && (
                    <div className="text-xs text-green-400 mt-1">Current</div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const name = prompt('Session name (optional):');
                onCreateSession(name || undefined);
              }}
              className="w-full mt-3 p-2 text-sm bg-gray-800 hover:bg-green-700 rounded transition-colors flex items-center justify-center gap-1"
            >
              <span>+</span>
              <span>New Session</span>
            </button>
          </div>
        )}

        {sidebarCollapsed && (
          <div className="flex-1 p-2">
            <div className="text-xs text-gray-500 text-center mb-2">{sessions.length}</div>
          </div>
        )}

        <div className="p-2 border-t border-gray-800 mt-auto">
          <button
            onClick={onLogout}
            className="w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors text-sm"
            title="Logout"
          >
            {sidebarCollapsed ? '↪' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-10 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-green-500">WinTerm Bridge</span>
            <span className="text-xs text-gray-500">Desktop</span>
          </div>
        </header>

        {/* Terminal area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
