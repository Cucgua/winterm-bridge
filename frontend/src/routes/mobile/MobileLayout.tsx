import React from 'react';

interface MobileLayoutProps {
  children: React.ReactNode;
  viewportHeight: number;
  keyboardVisible: boolean;
  onLogout: () => void;
}

export function MobileLayout({ children, viewportHeight, keyboardVisible, onLogout }: MobileLayoutProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-black"
      style={{ height: `${viewportHeight}px` }}
    >
      {/* Top bar - hidden when keyboard is visible */}
      {!keyboardVisible && (
        <header className="h-10 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-green-500">WinTerm</span>
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-white px-2 py-1"
          >
            Logout
          </button>
        </header>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
