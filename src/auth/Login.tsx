import React, { useRef, useState, useEffect } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound, ArrowRight } from 'lucide-react';
import logo from '../assets/tatu/contastatu.png';
import tatu from '../assets/tatu/tatu-login.png';
import './login.css';
export function Login({onLogin,error}: {onLogin:(login:string,password:string,remember:boolean)=>Promise<boolean>;error:string}) {
  const [login,setLogin]=useState(''); const [password,setPassword]=useState('');
  const [show,setShow]=useState(false); const [remember,setRemember]=useState(false);
  const [busy,setBusy]=useState(false); const lock=useRef(false);
  const page=useRef<HTMLElement>(null);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const mobile=window.matchMedia('(max-width:767px)');
    const root=document.documentElement,body=document.body;
    const previous={root:root.style.overflow,body:body.style.overflow,position:body.style.position,width:body.style.width};
    const update=()=>{
      const height=viewport?.height ?? window.innerHeight;
      page.current?.style.setProperty('--login-height',`${height}px`);
      page.current?.style.setProperty('--login-top',`${viewport?.offsetTop ?? 0}px`);
      if(page.current) {
        const style=getComputedStyle(page.current);
        const available=height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
        page.current.dataset.tight=String(mobile.matches && (height<800 || available<780));
        page.current.dataset.compact=String(mobile.matches && height<600);
      }
      root.style.overflow=mobile.matches?'clip':previous.root;
      body.style.overflow=mobile.matches?'clip':previous.body;
      body.style.position=mobile.matches?'fixed':previous.position;
      body.style.width=mobile.matches?'100%':previous.width;
    };
    update(); viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);mobile.addEventListener('change',update);
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);mobile.removeEventListener('change',update);root.style.overflow=previous.root;body.style.overflow=previous.body;body.style.position=previous.position;body.style.width=previous.width;};
  },[]);
  async function submit(e:React.FormEvent) {
    e.preventDefault(); if(lock.current) return;
    lock.current=true;setBusy(true);
    try { await onLogin(login,password,remember); } finally { setPassword('');lock.current=false;setBusy(false); }
  }
  return <main ref={page} className="login-page"><div className="login-leaves left" aria-hidden="true"/><div className="login-leaves right" aria-hidden="true"/>
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
