const { chromium }=require(process.argv[2]);
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const password=randomBytes(20).toString('base64url');const port='3102';const base=`http://127.0.0.1:${port}`;
 const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/controlled-dev.ts','--isolated'],{env:{...process.env,CONTAS_TATU_TEST_PASSWORD:password,CONTAS_TATU_LOCAL_PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const ready=new Promise((resolve,reject)=>{app.stdout.on('data',d=>{if(d.toString().includes('Controlled isolated'))resolve()});app.stderr.resume();app.on('exit',()=>reject(new Error('Isolated server stopped')));setTimeout(()=>reject(new Error('Isolated server timeout')),30000).unref();});
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'msedge',headless:true});
  const options={viewport:{width:393,height:852},isMobile:true,hasTouch:true};
  let context=await browser.newContext(options);let page=await context.newPage();
  context.setDefaultTimeout(10000);context.setDefaultNavigationTimeout(10000);
  const errors=[];const observe=()=>page.on('pageerror',e=>errors.push(e.message));observe();
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  await page.goto(base);await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  const out=path.join(process.env.TEMP,'contas-tatu-login');mkdirSync(out,{recursive:true});
  for(const [width,height]of [[393,852],[414,896],[1440,1000]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   const g=await page.evaluate(()=>{
    const login=document.querySelector('.login-page').getBoundingClientRect(),card=document.querySelector('.login-card').getBoundingClientRect(),tatu=document.querySelector('.login-tatu').getBoundingClientRect();
    return{overflow:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight,
     font:parseFloat(getComputedStyle(document.querySelector('.login-field input')).fontSize),button:document.querySelector('.login-submit').getBoundingClientRect().bottom,
     top:login.top,bottom:login.bottom,paws:tatu.top+tatu.height*.87-card.top};
   });
   assert.equal(g.overflow,false);assert.ok(g.font>=16);assert.ok(g.button<=height);
   assert.ok(Math.abs(g.paws)<10,'Mascot paws should rest on card edge');
   if(width<768){assert.equal(g.vertical,false);assert.equal(g.top,0);assert.equal(g.bottom,height);
    await page.mouse.wheel(0,400);assert.equal(await page.evaluate(()=>scrollY),0);
   }
   await page.screenshot({path:path.join(out,`login-${width}.png`)});
  }
  await page.setViewportSize({width:393,height:440});await page.getByLabel('Senha',{exact:true}).focus();
  console.log('Layout checks passed; checking keyboard and session flows.');
  await page.getByRole('button',{name:'Entrar',exact:true}).scrollIntoViewIfNeeded();
  console.log('Keyboard field and button passed.');
  assert.ok(await page.getByRole('button',{name:'Entrar',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  assert.equal(await page.evaluate(()=>scrollY),0);
  await page.setViewportSize({width:393,height:852});
  assert.equal(await page.getByText(/Criar conta|Esqueci minha senha/).count(),0);
  async function login(name,secret,remember=false){
   await page.getByLabel('Usuário',{exact:true}).fill(name);await page.getByLabel('Senha',{exact:true}).fill(secret);
   await page.getByLabel('Lembrar login').setChecked(remember);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();return(await response).status();
  }
  await login('Henrique','invalid');await page.getByRole('alert').filter({hasText:'Usuário ou senha incorretos.'}).waitFor();
  console.log('Invalid login passed.');
  assert.equal(await login('Henrique',password,true),200);await page.getByRole('log').waitFor();
  const h=(await (await context.request.get(base+'/api/auth/session')).json()).user;
  console.log('Remembered login passed.');
  let cookie=(await context.cookies()).find(c=>c.name==='contas_tatu_session');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.ok(cookie.expires>Date.now()/1000);
  let state=await context.storageState();await context.close();context=await browser.newContext({...options,storageState:state});page=await context.newPage();observe();
  await page.goto(base);await page.getByRole('log').waitFor();
  await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  assert.equal((await context.cookies()).some(c=>c.name==='contas_tatu_session'),false);
  assert.equal(await login('Jessica',password,false),200);await page.getByRole('log').waitFor();
  const headers=await page.evaluate(async()=> (await import('/src/auth/navigationSession.ts')).navigationHeaders());
  const j=(await (await context.request.get(base+'/api/auth/session',{headers})).json()).user;
  console.log('Temporary login passed.');
  assert.equal(j.name,'Jéssica');assert.equal(h.householdId,j.householdId);
  cookie=(await context.cookies()).find(c=>c.name==='contas_tatu_session');assert.equal(cookie.expires,-1);
  // Check missing proof with a separate request cookie jar, so this deliberate 401 cannot clear the active UI cookie.
  const isolated=await browser.newContext({...options,storageState:await context.storageState()});
  assert.equal((await isolated.request.get(base+'/api/auth/session')).status(),401,'Cookie alone must not restore temporary session');await isolated.close();
  assert.equal(await page.evaluate(async()=>{
   const {navigationHeaders}=await import('/src/auth/navigationSession.ts');
   return(await fetch('/api/auth/session',{headers:navigationHeaders(),signal:AbortSignal.timeout(10000)})).status;
  }),200);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).length+Object.keys(sessionStorage).length),0);
  // Even restoration of the session cookie cannot restore the discarded document proof.
  state=await context.storageState();await context.close();context=await browser.newContext({...options,storageState:state});page=await context.newPage();observe();
  await page.goto(base);await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  await login('Henrique',password,false);await page.getByRole('log').waitFor();
  await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  assert.deepEqual(errors,[]);console.log('PASS fixed login 393/414, desktop, mascot edge, logo, keyboard viewport simulation, both users, remembered restart, temporary restart with restored cookie rejected, logout and reload, protected routes, no auth browser storage. Screenshots:',out);
 }catch(e){console.error('Browser failure:',e);throw e;}finally{if(browser)await browser.close();app.kill();app.stdout.destroy();app.stderr.destroy();}
})().catch(e=>{console.error('Auth browser validation failed:',e.message);process.exitCode=1});
