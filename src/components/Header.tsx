import React from 'react';
import { Settings, LayoutDashboard, ReceiptText, Plus, ArrowUpRight } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthSelector } from './MonthSelector';
import { TatuIllustration } from './TatuIllustration';

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, currentMonth, setCurrentMonth, isSettingsOpen, setIsSettingsOpen, openCreateAccountModal, financialSummary } = useFinance();
  return (
    <>
      <aside className="app-sidebar">
        <div className="app-brand"><TatuIllustration className="brand-mascot" /><div><h1>Contas Tatu<span>.</span></h1><p>Seu mês, mais leve</p></div></div>
        <p className="nav-caption">SEU ESPAÇO</p>
        <nav className="app-nav" aria-label="Navegação principal">
          <button id="tab-dashboard" type="button" aria-current={!isSettingsOpen && activeTab === 'dashboard' ? 'page' : undefined} onClick={() => setActiveTab('dashboard')}><LayoutDashboard size={18} /><span>Início</span></button>
          <button id="tab-accounts" type="button" aria-current={!isSettingsOpen && activeTab === 'accounts' ? 'page' : undefined} onClick={() => setActiveTab('accounts')}><ReceiptText size={18} /><span>Contas</span>{financialSummary.pendingCount > 0 && <b className="nav-count">{financialSummary.pendingCount}</b>}</button>
          <button id="btn-settings-header" type="button" aria-haspopup="dialog" aria-expanded={isSettingsOpen} onClick={() => setIsSettingsOpen(true)}><Settings size={18} /><span>Configurações</span></button>
        </nav>
        <div className="sidebar-note"><span className="note-kicker">UM PASSO DE CADA VEZ</span><p>Disciplina hoje,<br />mais liberdade amanhã.</p><TatuIllustration variant="laptop" className="note-mascot" /><span className="note-signature">Cada conta em seu lugar.</span></div>
        <span className="sidebar-footer">Feito para simplificar seu mês.</span>
      </aside>
      <header className="app-toolbar">
        <div className="toolbar-title"><span>CONTAS TATU</span><p>{activeTab === 'dashboard' ? 'Um olhar sobre o seu mês' : 'Tudo no seu lugar'}</p></div>
        <div className="app-month"><MonthSelector currentMonth={currentMonth} onMonthChange={setCurrentMonth} /></div>
        <button id="btn-header-new-account" type="button" onClick={openCreateAccountModal} className="new-account-button"><Plus size={16} /><span>Nova conta</span><ArrowUpRight size={15} /></button>
      </header>
    </>
  );
};
