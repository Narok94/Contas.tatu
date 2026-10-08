import React, { useState } from 'react';
import { useFinance } from './context/FinanceContext';
import { Header } from './components/Header';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { SettingsModal } from './components/SettingsModal';
import { AccountModal } from './components/AccountModal';
import './shell.css';
import { HistoryPage } from './pages/HistoryPage';
import { PaymentDialog } from './components/PaymentDialog';
import './history.css';

const AppContent: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    activeTab,
    isSettingsOpen,
    setIsSettingsOpen,
    isAccountModalOpen,
    closeAccountModal,
    editingAccount,
    operationError, clearOperationError, loading, busy, mode, refresh, hasCurrentView,
  } = useFinance();

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} min-h-screen bg-canvas text-stone-900 flex flex-col font-sans selection:bg-brand/20`}>
      {/* Persistent sidebar and shared toolbar */}
      <Header collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} />
      {(loading || busy) && <div role="status" className="fixed bottom-6 right-6 z-40 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm shadow-sm">{busy ? 'Salvando…' : 'Carregando dados…'}</div>}

      {/* Main Content Area */}
      <main className="app-main flex-1 pb-10">
        {mode === 'neon' && !hasCurrentView ? <div className="p-6 text-sm">{loading ? 'Aguarde o carregamento do mês.' : <><p>Não foi possível carregar os dados.</p><button onClick={refresh}>Tentar novamente</button></>}</div> : activeTab === 'dashboard' ? <DashboardPage /> : activeTab === 'accounts' ? <AccountsPage /> : <HistoryPage />}
      </main>
      <PaymentDialog />
      {operationError && <div className="operation-error" role="alert"><span>{operationError}</span>{refresh && <button onClick={refresh}>Atualizar</button>}<button onClick={clearOperationError} aria-label="Fechar aviso">×</button></div>}

      {/* Account Modal (Create / Edit) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={closeAccountModal}
        editingAccount={editingAccount}
      />

      {/* Settings Modal (accessed via top-right gear icon) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Minimal Footer */}
      <footer className="app-footer border-t border-line bg-surface-soft/80 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-medium text-stone-700">Contas Tatu · Cada conta em seu lugar</span>
          <span className="text-stone-400">
            Focado em clareza, previsibilidade e conferência mensal
          </span>
        </div>
      </footer>
    </div>
  );
};

export default AppContent;
