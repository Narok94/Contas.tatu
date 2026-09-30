import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Login } from './Login';
import { beginNavigationSession, clearNavigationSession, navigationHeaders } from './navigationSession';
export interface User { id: string; name: string; householdId: string }
const Context = createContext<{ user: User; logout: () => Promise<void> } | null>(null);
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('Authentication required'); return value; }
export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user,setUser] = useState<User>();
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const generation=useRef(0);
  const loggingOut=useRef(false);
  const loggingIn=useRef(false);
  async function session() {
    if(loggingOut.current || loggingIn.current) return;
    const current=generation.current;
    try {
      const r = await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',headers:navigationHeaders()});
      const body=r.ok ? await r.json() : undefined;
      if(current!==generation.current) return;
      if (r.ok) setUser(body.user);
      else if (r.status===401) { clearNavigationSession(); setUser(undefined); }
      else setError('Não foi possível conectar. Tente novamente em instantes.');
    } catch { if(current===generation.current) setError('Não foi possível conectar. Tente novamente em instantes.'); }
    finally { if(current===generation.current) setLoading(false); }
  }
  useEffect(() => {
    void session();
    const timer = window.setInterval(() => void session(),15*60*1000);
    const expired = () => { ++generation.current; clearNavigationSession(); setUser(undefined); setError('Sua sessão terminou. Entre novamente.'); };
    window.addEventListener('auth-expired',expired);
    return () => { clearInterval(timer); window.removeEventListener('auth-expired',expired); };
  },[]);
  async function login(login: string,password: string,remember: boolean) {
    loggingIn.current=true;
    ++generation.current;
    const navigationKey=beginNavigationSession(remember);
    setError('');
    try {
      const r=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password,remember,navigationKey})});
      if (r.ok) { setUser((await r.json()).user); loggingIn.current=false; return true; }
      setError(r.status===401 ? 'Usuário ou senha incorretos.' : r.status===429 ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : 'Não foi possível conectar. Tente novamente em instantes.');
    } catch { setError('Não foi possível conectar. Tente novamente em instantes.'); }
    loggingIn.current=false; clearNavigationSession(); return false;
  }
  async function logout() {
    if(loggingOut.current) return;
    loggingOut.current=true; ++generation.current;
    try {
      const r = await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{...navigationHeaders(),'Content-Type':'application/json'},body:'{}'});
      if (!r.ok) throw new Error();
      clearNavigationSession(); setUser(undefined); setError('');
    } catch { setError('Não foi possível sair. Tente novamente.'); }
    finally { loggingOut.current=false; }
  }
  if (loading) return <div className="auth-loading" role="status">Carregando seu cantinho…</div>;
  if (!user) return <Login onLogin={login} error={error} />;
  return <Context.Provider value={{user,logout}}>{children}{error && <p className="auth-feedback" role="alert">{error}</p>}</Context.Provider>;
}
