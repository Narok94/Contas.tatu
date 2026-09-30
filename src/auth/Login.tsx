import React, { useRef, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound, ArrowRight } from 'lucide-react';
import logo from '../assets/tatu/contastatu.png';
import tatu from '../assets/tatu/tatu-login.png';
import './login.css';
export function Login({onLogin,error}: {onLogin:(login:string,password:string,remember:boolean)=>Promise<boolean>;error:string}) {
  const [login,setLogin]=useState(''); const [password,setPassword]=useState('');
  const [show,setShow]=useState(false); const [remember,setRemember]=useState(false);
  const [busy,setBusy]=useState(false); const lock=useRef(false);
  async function submit(e:React.FormEvent) {
    e.preventDefault(); if(lock.current) return;
    lock.current=true;setBusy(true);
    try { await onLogin(login,password,remember); } finally { setPassword('');lock.current=false;setBusy(false); }
  }
  return <main className="login-page"><div className="login-leaves left" aria-hidden="true"/><div className="login-leaves right" aria-hidden="true"/>
    <div className="login-composition"><img className="login-logo" src={logo} alt="Contas Tatu"/>
      <div className="login-card-wrap"><img className="login-tatu" src={tatu} alt=""/>
      <section className="login-card" aria-labelledby="login-title"><h1 id="login-title">Bem-vindo!</h1><p className="login-subtitle">Entre para cuidar das suas contas</p>
        <form onSubmit={submit}>
          <label className="login-field">Usuário<span><UserRound size={20}/><input autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} value={login} onChange={e=>setLogin(e.target.value)} placeholder="Seu usuário"/></span></label>
          <label className="login-field">Senha<span><LockKeyhole size={20}/><input autoComplete="current-password" required maxLength={72} type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={21}/>:<Eye size={21}/>}</button></span></label>
          <label className="login-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Lembrar login</label>
          {error&&<p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={busy}>{busy?'Entrando…':'Entrar'}{!busy&&<ArrowRight size={20}/>}</button>
        </form>
      </section></div><p className="login-footer">Seu cantinho financeiro, simples e seguro.</p>
    </div>
  </main>;
}
