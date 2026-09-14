import React from 'react';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { Header } from './components/Header';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { SettingsModal } from './components/SettingsModal';
import { AccountModal } from './components/AccountModal';

const AppContent: React.FC = () => {
  const {
    activeTab,
    isSettingsOpen,
    setIsSettingsOpen,
    isAccountModalOpen,
    closeAccountModal,
    editingAccount,
  } = useFinance();

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-stone-900 flex flex-col font-sans selection:bg-[#9E432A]/20">
      {/* Top Header */}
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' ? <DashboardPage /> : <AccountsPage />}
      </main>

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
      <footer className="border-t border-[#E2DDD3] bg-[#FAF8F5]/80 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-medium text-stone-700">Controle Financeiro Mensal do Casal</span>
          <span className="text-stone-400">
            Focado em clareza, previsibilidade e conferência mensal
          </span>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <FinanceProvider>
      <AppContent />
    </FinanceProvider>
  );
}
