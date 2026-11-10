import React from 'react';
import { Settings, House, WalletCards, Plus, History, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthSelector } from './MonthSelector';
import { useAuth } from '../auth/AuthContext';
import { formatMonthYear } from '../utils/formatters';
import logo from '../assets/tatu/contastatu.png';

export const Header: React.FC<{ onAccounts?: () => void }> = ({ onAccounts }) => {
  const { user, logout } = useAuth();
  const { activeTab, setActiveTab, currentMonth, setCurrentMonth, isSettingsOpen, setIsSettingsOpen, openCreateAccountModal } = useFinance();
  const reports = () => {
    setActiveTab('dashboard');
    requestAnimationFrame(() => document.getElementById('desktop-reports')?.focus());
  };
  return <>
    <aside className="app-sidebar">
      <a className="app-brand" href="#dashboard" aria-label="Contas Tatu — Dashboard" onClick={event => { event.preventDefault(); setActiveTab('dashboard'); }}><img src={logo} alt="Contas Tatu" /></a>
      <nav id="desktop-navigation" aria-label="Navegação principal">
        <button id="tab-dashboard" aria-current={!isSettingsOpen && activeTab === 'dashboard' ? 'page' : undefined} onClick={() => setActiveTab('dashboard')}><House /><span>Dashboard</span></button>
        <button id="tab-accounts" aria-current={!isSettingsOpen && activeTab === 'accounts' ? 'page' : undefined} onClick={() => { onAccounts?.(); setActiveTab('accounts'); }}><WalletCards /><span>Contas</span></button>
        <button id="tab-history" aria-current={!isSettingsOpen && activeTab === 'history' ? 'page' : undefined} onClick={() => setActiveTab('history')}><History /><span>Histórico</span></button>
        <button id="tab-reports" onClick={reports}><ChartNoAxesColumnIncreasing /><span>Relatórios</span></button>
        <button id="btn-settings-header" aria-haspopup="dialog" aria-expanded={isSettingsOpen} aria-current={isSettingsOpen ? 'page' : undefined} onClick={() => setIsSettingsOpen(true)}><Settings /><span>Configurações</span></button>
      </nav>
    </aside>
    <header className="app-toolbar">
      <div className="desk-greeting"><h2>Olá, {user.name.split(' ')[0]}!</h2><p>{formatMonthYear(currentMonth)}</p></div>
      <div className="app-month"><MonthSelector currentMonth={currentMonth} onMonthChange={setCurrentMonth} /></div>
      <button id="btn-header-new-account" type="button" onClick={openCreateAccountModal} className="new-account-button"><Plus /><span>Nova conta</span></button>
      <div className="toolbar-account"><span title={user.name}>{user.name.split(' ')[0]}</span><button type="button" onClick={() => void logout()}>Sair</button></div>
    </header>
    <svg className="desktop-landscape" viewBox="0 0 1600 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 100 Q130 10 330 160H900Q1100 40 1260 95Q1430 -35 1600 35V160H0Z" fill="#dce1bf"/><path d="M850 160Q1040 60 1210 125T1600 65V160Z" fill="#bdc99b"/></svg>
    <svg className="desktop-leaves" viewBox="0 0 150 210" aria-hidden="true"><path d="M10 210Q40 100 120 20" fill="none" stroke="#9cac7a" strokeWidth="3"/>{[0,1,2,3].map(i => <g key={i} transform={`translate(${i*22} ${150-i*40})`}><path d="M0 20Q-35 -35 0 -50Q25 -10 0 20Z" fill="#aab98b"/><path d="M0 20Q30 -30 65 -15Q45 20 0 20Z" fill="#b6c39a"/></g>)}</svg>
  </>;
};
