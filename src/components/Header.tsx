import React from 'react';
import { Settings, LayoutDashboard, ReceiptText, Plus, Home } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthSelector } from './MonthSelector';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentMonth,
    setCurrentMonth,
    setIsSettingsOpen,
    openCreateAccountModal,
    financialSummary,
  } = useFinance();

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E7E2D8] shadow-2xs">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand & App Title */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#9E432A] text-white flex items-center justify-center font-bold text-sm shadow-2xs">
              <Home className="w-4 h-4 text-amber-100/90" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-stone-900 tracking-tight leading-tight">
                Finanças do Casal
              </h1>
              <span className="text-[11px] text-stone-500 font-medium">
                Organização pessoal
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Pill Style) */}
          <nav className="hidden sm:flex items-center bg-[#ECE7DE] p-1 rounded-xl">
            <button
              id="tab-dashboard"
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-[#9E432A] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Início</span>
            </button>
            <button
              id="tab-accounts"
              type="button"
              onClick={() => setActiveTab('accounts')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer relative ${
                activeTab === 'accounts'
                  ? 'bg-white text-[#9E432A] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>Contas</span>
              {financialSummary.pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-100/90 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200/60">
                  {financialSummary.pendingCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Center: Month Selector */}
        <div className="flex items-center">
          <MonthSelector
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
          />
        </div>

        {/* Right: + Nova Conta & Configurações */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            id="btn-header-new-account"
            type="button"
            onClick={openCreateAccountModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2 bg-[#9E432A] hover:bg-[#88361F] text-white text-xs font-semibold rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap"
            title="Adicionar nova conta, despesa ou parcelamento"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nova conta</span>
          </button>

          <button
            id="btn-settings-header"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Configurações e Categorias"
            className="p-2 text-stone-500 hover:text-[#9E432A] hover:bg-[#ECE7DE]/60 rounded-xl transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

