const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {existsSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const playwrightPath=process.argv[2] || process.env.PATH.split(path.delimiter).map(p=>path.resolve(p,'../playwright')).find(p=>existsSync(path.join(p,'index.js')));
if(!playwrightPath)throw new Error('Pass Playwright module path or run via pnpm --package=playwright dlx node tests/chat-browser.cjs');
const {chromium}=require(playwrightPath);
(async()=>{
 const password=randomBytes(20).toString('base64url'),port='3103',base=`http://127.0.0.1:${port}`;
 const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/controlled-dev.ts','--isolated'],{env:{...process.env,CONTAS_TATU_TEST_PASSWORD:password,CONTAS_TATU_LOCAL_PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const ready=new Promise((resolve,reject)=>{app.stdout.on('data',d=>{if(d.toString().includes('Controlled isolated'))resolve();});app.stderr.on('data',d=>process.stderr.write(d));app.on('exit',()=>reject(new Error('Server stopped')));setTimeout(()=>reject(new Error('Server timeout')),30000).unref();});
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'msedge',headless:true});
  const options={viewport:{width:393,height:852},isMobile:true,hasTouch:true};
  const hc=await browser.newContext(options),jc=await browser.newContext(options);
  const h=await hc.newPage(),j=await jc.newPage();const errors=[];
  for(const page of [h,j]){page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));}
  async function login(page,name){await page.getByPlaceholder('Seu usuário').fill(name);await page.getByPlaceholder('Sua senha').fill(password);await page.getByLabel('Lembrar login').check();await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('log',{name:'Conversa da casa'}).waitFor();await page.waitForFunction(()=>!document.querySelector('.chat-stream [role=status]'));}
  async function send(page,text){await page.getByLabel('Digite sua conta').fill(text);await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.getByLabel('Digite sua conta').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.chat-composer input').value==='');}
  await h.goto(base);await j.goto(base);await login(h,'Henrique');await login(j,'Jessica');
  await send(h,'Mercado 123,45');await j.getByText('Mercado 123,45',{exact:true}).waitFor();
  await send(j,'Internet 79,90');await h.getByText('Internet 79,90',{exact:true}).waitFor();
  const draft=j.locator('.chat-message').filter({has:j.getByRole('heading',{name:'Mercado',exact:true})});
  await draft.getByRole('button',{name:'Sim, adicionar',exact:true}).click();
  await j.getByText('✓ Conta adicionada com sucesso',{exact:true}).waitFor();await h.getByText('✓ Conta adicionada com sucesso',{exact:true}).waitFor();
  await h.reload();await h.getByText('Mercado 123,45',{exact:true}).waitFor();
  await h.getByRole('button',{name:'Menu',exact:true}).click();await h.getByRole('button',{name:'Sair',exact:true}).click();await login(h,'Jessica');
  await h.getByText('Mercado 123,45',{exact:true}).waitFor();await h.getByText('Internet 79,90',{exact:true}).waitFor();
  await h.getByLabel('Buscar no histórico').fill('Mercado');await h.getByLabel('Filtrar por autor').selectOption({label:'Jéssica'});await h.getByRole('button',{name:'Buscar',exact:true}).click();
  await h.getByText('✓ Conta adicionada com sucesso',{exact:true}).waitFor();
  await h.waitForFunction(()=>document.querySelectorAll('.chat-message').length===1);
  assert.equal(await h.getByText('Mercado 123,45',{exact:true}).count(),0);
  await h.getByLabel('Buscar no histórico').fill('');await h.getByLabel('Filtrar por autor').selectOption('');await h.getByRole('button',{name:'Buscar',exact:true}).click();await h.getByText('Internet 79,90',{exact:true}).waitFor();
  const corrected=h.locator('.chat-message').filter({has:h.getByRole('heading',{name:'Internet',exact:true})});await corrected.getByRole('button',{name:'Editar detalhes',exact:true}).click();
  await h.locator('input[name=description]').fill('Internet corrigida');await h.locator('input[name=amount]').fill('82,30');await h.getByRole('button',{name:'Adicionar conta',exact:true}).click();
  await h.getByRole('dialog').waitFor({state:'hidden'});await j.getByRole('heading',{name:'Internet corrigida',exact:true}).first().waitFor();
  await h.getByRole('button',{name:'Contas do mês',exact:true}).click();await h.getByText('Internet corrigida',{exact:true}).first().waitFor();
  await h.getByRole('button',{name:'Voltar',exact:true}).click();
  assert.deepEqual(errors,[]);
  const geometry=await h.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,height:document.querySelector('.chat-app').getBoundingClientRect().height,button:document.querySelector('.chat-composer button').getBoundingClientRect().bottom}));
  assert.equal(geometry.overflow,false);assert.ok(geometry.button<=852);
  const out=path.join(process.env.TEMP,'contas-tatu-chat');mkdirSync(out,{recursive:true});await h.screenshot({path:path.join(out,'shared-chat.png')});
  console.log('PASS: two users, live sharing, confirmation, reload, logout/user switch, search, correction, manual navigation, mobile layout');
 }finally{if(browser)await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
