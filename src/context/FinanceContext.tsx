import React from 'react';
const LocalFinanceProvider = import.meta.env.DEV ? React.lazy(() => import('./LocalFinanceProvider').then(m => ({ default: m.LocalFinanceProvider }))) : null;
import { NeonFinanceProvider } from './NeonFinanceProvider';
export { useFinance } from './financeContextState';
// Explicit development-only rollback. Never fall back after an API error.
export const FinanceProvider = ({ children }: { children: React.ReactNode }) =>
  import.meta.env.DEV && import.meta.env.VITE_FINANCE_MODE === 'local'
    ? <React.Suspense fallback={null}><LocalFinanceProvider>{children}</LocalFinanceProvider></React.Suspense>
    : <NeonFinanceProvider>{children}</NeonFinanceProvider>;
