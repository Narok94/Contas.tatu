import React, { Suspense, lazy } from 'react';
import { FinanceProvider } from './context/FinanceContext';
import { useMobileViewport } from './mobile/useMobileViewport';
import { AuthProvider } from './auth/AuthContext';
const DesktopApp = lazy(() => import('./DesktopApp'));
const MobileApp = lazy(() => import('./mobile/MobileApp'));
export default function App() {
  const mobile = useMobileViewport();
  return <AuthProvider><FinanceProvider apiOnly={mobile}><Suspense fallback={<p role="status" style={{ padding: 24 }}>Carregando Contas Tatu…</p>}>
    {mobile ? <MobileApp /> : <DesktopApp />}
  </Suspense></FinanceProvider></AuthProvider>;
}
