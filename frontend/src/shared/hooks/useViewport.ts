import { useState, useEffect } from 'react';

interface ViewportState {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  keyboardVisible: boolean;
}

export function useViewport(): ViewportState {
  const [viewport, setViewport] = useState<ViewportState>({
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    keyboardVisible: false,
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const vv = window.visualViewport;
        const keyboardVisible = vv.height < window.innerHeight * 0.75;
        setViewport({
          width: vv.width,
          height: vv.height,
          offsetLeft: vv.offsetLeft,
          offsetTop: vv.offsetTop,
          keyboardVisible,
        });
      }
    };

    handleResize();
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return viewport;
}
