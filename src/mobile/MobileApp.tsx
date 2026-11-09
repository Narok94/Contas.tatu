import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CreditCard, History, List, LogOut, Menu, Settings, ShoppingCart } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { SettingsModal } from '../components/SettingsModal';
import { useFinance } from '../context/FinanceContext';
import { GuidedExpenseFlow } from './GuidedExpenseFlow';
import { MobileHistory } from './MobileHistory';
import MobileManual from './MobileManual';
import { MobilePaymentFlow } from './MobilePaymentFlow';
import { MobileSheet } from './MobileSheet';
import './mobile.css';
import './conversation.css';

const choices = [
  { key: 'purchase', title: 'Compra', description: 'Gasto, compra do dia, mercado e mais.', icon: ShoppingCart },
  { key: 'payment', title: 'Pagamento', description: 'Pagar uma conta, total ou parcialmente.', icon: CreditCard },
  { key: 'general', title: 'Geral', description: 'Lançamento manual com todos os campos.', icon: List },
] as const;
type Screen = 'home' | 'history' | typeof choices[number]['key'];

export default function MobileApp() {
  const f = useFinance();
  const { logout } = useAuth();
  const [screen, setScreen] = useState<Screen>('home');
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const active = choices.find(choice => choice.key === screen);
  const TitleIcon = active?.icon ?? History;

  useEffect(() => {
    window.scrollTo(0, 0);
    if (screen !== 'home') heading.current?.focus({ preventScroll: true });
  }, [screen]);

  function go(next: Screen) {
    setNotice('');
    f.clearOperationError();
    if (next === 'payment' || next === 'history') f.refresh();
    setScreen(next);
  }

  function saved(message: string) {
    setNotice(message);
    setScreen('home');
  }

  if (screen === 'general') return <MobileManual initialScreen="choose" onBack={() => go('home')} />;

  return <div className="mobile-app mobile-dashboard" data-testid="mobile-app">
    <header className="chat-header">
      <span className="chat-brand">Contas Tatu</span>
      <button type="button" aria-label="Menu" className="mobile-icon-button" disabled={saving || f.busy} onClick={() => setMenu(true)}><Menu size={20} /></button>
    </header>
    <section className="chat-hero" aria-label="Boas-vindas"><h1>Oi casal ❤️</h1><p>Aqui é o espaço financeiro de vocês.</p></section>
    <main className="mobile-dashboard-panel">
      {screen === 'home' ? <>
        {notice && <p role="status" className="mobile-dashboard-notice"><Check size={18} />{notice}</p>}
        <h2>O que você quer lançar?</h2>
        <nav className="mobile-dashboard-actions" aria-label="Lançamentos">
          {choices.map(({ key, title, description, icon: Icon }) => <button key={key} type="button" onClick={() => go(key)}>
            <Icon className="mobile-dashboard-action-icon" size={34} />
            <span><strong>{title}</strong><small>{description}</small></span>
            <ChevronRight size={20} />
          </button>)}
        </nav>
      </> : <>
        <div className="mobile-flow-heading">
          <TitleIcon size={27} />
          <h2 ref={heading} tabIndex={-1}>{active?.title ?? 'Histórico'}</h2>
          <button type="button" className="mobile-icon-button" aria-label="Voltar para o início" disabled={saving || f.busy} onClick={() => go('home')}><ArrowLeft size={20} /></button>
        </div>
        {screen === 'purchase' && <GuidedExpenseFlow onSaving={setSaving} onSuccess={() => saved('Compra adicionada.')} />}
        {screen === 'payment' && <MobilePaymentFlow onSuccess={() => saved('Pagamento registrado.')} />}
        {screen === 'history' && <MobileHistory />}
      </>}
    </main>
    {menu && <MobileSheet title="Seu Contas Tatu" onClose={() => setMenu(false)}>
      <div className="mobile-sheet-actions mobile-dashboard-menu">
        <button type="button" onClick={() => { setMenu(false); go('history'); }}><History size={20} />Histórico</button>
        <button type="button" onClick={() => { setMenu(false); setSettings(true); }}><Settings size={20} />Configurações</button>
        <button type="button" onClick={() => void logout()}><LogOut size={20} />Sair</button>
      </div>
    </MobileSheet>}
    {settings && <SettingsModal isOpen onClose={() => setSettings(false)} />}
  </div>;
}
