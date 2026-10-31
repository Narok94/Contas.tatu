import React from 'react';
import { Settings, LayoutDashboard, ReceiptText, Plus, ArrowUpRight, History } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthSelector } from './MonthSelector';
import { TatuIllustration } from './TatuIllustration';
import { useAuth } from '../auth/AuthContext';

export const Header: React.FC<{ onAccounts?: () => void }> = ({ onAccounts }) => {
  const { user, logout } = useAuth();
  const { activeTab, setActiveTab, currentMonth, setCurrentMonth, isSettingsOpen, setIsSettingsOpen, openCreateAccountModal } = useFinance();
  return (
    <>
      <header className="app-toolbar">
        <div className="app-brand"><TatuIllustration className="brand-mascot" /><h1>Contas Tatu<span>.</span></h1></div>
        <div className="app-month"><MonthSelector currentMonth={currentMonth} onMonthChange={setCurrentMonth} /></div>
        <button id="btn-header-new-account" type="button" onClick={openCreateAccountModal} className="new-account-button"><Plus size={16} /><span>Nova conta</span><ArrowUpRight size={15} /></button>
        <div className="toolbar-account"><span title={user.name}>{user.name}</span><button type="button" onClick={() => void logout()}>Sair</button></div>
      </header>
      <nav id="desktop-navigation" className="desktop-dock" aria-label="Navegação principal">
        <button id="tab-dashboard" type="button" aria-label="Início" aria-describedby="dock-tip-dashboard" aria-current={!isSettingsOpen && activeTab === 'dashboard' ? 'page' : undefined} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={20} aria-hidden="true" /><span id="dock-tip-dashboard" className="dock-tooltip" role="tooltip">Início</span>
        </button>
        <button id="tab-accounts" type="button" aria-label="Contas" aria-describedby="dock-tip-accounts" aria-current={!isSettingsOpen && activeTab === 'accounts' ? 'page' : undefined} onClick={() => { onAccounts?.(); setActiveTab('accounts'); }}>
          <ReceiptText size={20} aria-hidden="true" /><span id="dock-tip-accounts" className="dock-tooltip" role="tooltip">Contas</span>
        </button>
        <button id="tab-history" type="button" aria-label="Histórico" aria-describedby="dock-tip-history" aria-current={!isSettingsOpen && activeTab === 'history' ? 'page' : undefined} onClick={() => setActiveTab('history')}>
          <History size={20} aria-hidden="true" /><span id="dock-tip-history" className="dock-tooltip" role="tooltip">Histórico</span>
        </button>
        <button id="btn-settings-header" type="button" aria-label="Configurações" aria-describedby="dock-tip-settings" aria-haspopup="dialog" aria-expanded={isSettingsOpen} aria-current={isSettingsOpen ? 'page' : undefined} onClick={() => setIsSettingsOpen(true)}>
          <Settings size={20} aria-hidden="true" /><span id="dock-tip-settings" className="dock-tooltip" role="tooltip">Configurações</span>
        </button>
      </nav>
    </>
  );
};
