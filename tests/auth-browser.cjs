const { chromium }=require(process.argv[2]);
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const password=randomBytes(20).toString('base64url');const port='3102';const base=`http://127.0.0.1:${port}`;
 const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/controlled-dev.ts','--isolated'],{env:{...process.env,CONTAS_TATU_TEST_PASSWORD:password,CONTAS_TATU_LOCAL_PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const ready=new Promise((resolve,reject)=>{app.stdout.on('data',d=>{if(d.toString().includes('Controlled isolated'))resolve()});app.on('exit',()=>reject(new Error('Isolated server stopped')));setTimeout(()=>reject(new Error('Isolated server timeout')),30000).unref();});
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  await page.goto(base);await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  const out=path.join(process.env.TEMP,'contas-tatu-login');mkdirSync(out,{recursive:true});
  for(const [width,height]of [[393,852],[414,896],[1440,1000]]){
   await page.setViewportSize({width,height});await page.screenshot({path:path.join(out,`login-${width}.png`)});
   const g=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,font:parseFloat(getComputedStyle(document.querySelector('.login-field input')).fontSize),button:document.querySelector('.login-submit').getBoundingClientRect().bottom}));
   assert.equal(g.overflow,false);assert.ok(g.font>=16);assert.ok(g.button<=height);
  }
  await page.setViewportSize({width:393,height:440});await page.getByLabel('Senha',{exact:true}).focus();await page.getByRole('button',{name:'Entrar',exact:true}).scrollIntoViewIfNeeded();
  await page.setViewportSize({width:393,height:852});
  assert.equal(await page.getByText(/Criar conta|Esqueci minha senha/).count(),0);
  async function login(name,secret){await page.getByLabel('Usuário',{exact:true}).fill(name);await page.getByLabel('Senha',{exact:true}).fill(secret);await page.getByRole('button',{name:'Entrar',exact:true}).click();}
  await login('Henrique','invalid');await page.getByRole('alert').filter({hasText:'Usuário ou senha incorretos.'}).waitFor();
  await page.getByLabel('Lembrar login').check();await login('Henrique',password);await page.getByRole('log').waitFor();
  const cookie=(await context.cookies()).find(c=>c.name==='contas_tatu_session');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.ok(cookie.expires>Date.now()/1000);
  const h=(await(await context.request.get(base+'/api/auth/session')).json()).user;
  await page.getByRole('textbox',{name:'Digite sua conta'}).fill('luz 200');await page.getByRole('button',{name:'Enviar',exact:true}).click();
  assert.equal(await page.locator('.chat-message.user .chat-byline b').textContent(),'Henrique');
  assert.equal(await page.getByLabel('Autor local de teste').count(),0);
  await page.reload();await page.getByRole('log').waitFor();
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);
  await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('heading',{name:'Bem-vindo!'}).waitFor();
  assert.equal((await context.request.get(base+'/api/finance?month=2026-09')).status(),401);
  await login('Jessica',password);await page.getByRole('log').waitFor();
  const j=(await(await context.request.get(base+'/api/auth/session')).json()).user;assert.equal(j.name,'Jéssica');assert.equal(h.householdId,j.householdId);
  await page.getByRole('textbox',{name:'Digite sua conta'}).fill('mercado 300');await page.getByRole('button',{name:'Enviar',exact:true}).click();
  assert.equal(await page.locator('.chat-message.user .chat-byline b').textContent(),'Jéssica');
  await page.getByRole('button',{name:'Adicionar',exact:true}).click();await page.getByText('✓ Conta adicionada com sucesso',{exact:true}).waitFor();
  await page.setViewportSize({width:1440,height:1000});await page.locator('.app-sidebar').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS login mobile 393/414, desktop, keyboard viewport simulation, errors, session persistence, logout, protected routes, both authors and shared household, no sensitive localStorage. Screenshots:',out);
 }finally{if(browser)await browser.close();app.kill();}
})().catch(()=>{console.error('Auth browser validation failed.');process.exitCode=1});
