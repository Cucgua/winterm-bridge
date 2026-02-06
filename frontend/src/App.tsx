import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useDeviceType } from './shared/hooks/useDeviceType';
import { useTheme } from './shared/hooks/useTheme';

const DesktopApp = lazy(() => import('./routes/desktop/DesktopApp'));
const MobileApp = lazy(() => import('./routes/mobile/MobileShell'));

function AutoRedirect() {
  const navigate = useNavigate();
  const isMobile = useDeviceType();

  useEffect(() => {
    navigate(isMobile ? '/mobile' : '/desktop', { replace: true });
  }, [isMobile, navigate]);

  return <LoadingScreen />;
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-canvas text-text-primary">
      <div className="text-center">
        <h1 className="text-xl font-bold">WinTerm Bridge</h1>
        <p className="text-text-secondary mt-2">Loading...</p>
      </div>
    </div>
  );
}

// Theme initializer component
function ThemeInitializer({ children }: { children: React.ReactNode }) {
  useTheme(); // Initialize theme on app load
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeInitializer>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/desktop/*" element={<DesktopApp />} />
            <Route path="/mobile/*" element={<MobileApp />} />
            <Route path="/" element={<AutoRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeInitializer>
  );
}
