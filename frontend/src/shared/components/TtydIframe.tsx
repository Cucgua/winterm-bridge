import React from 'react';

interface TtydIframeProps {
  sessionId: string;
  className?: string;
}

export const TtydIframe: React.FC<TtydIframeProps> = ({ sessionId, className }) => {
  // ttyd 页面 URL，通过反向代理访问
  const ttydUrl = `/ttyd/${sessionId}/`;

  return (
    <iframe
      src={ttydUrl}
      className={className || 'w-full h-full border-0'}
      allow="clipboard-read; clipboard-write"
      title="Terminal"
    />
  );
};
