// Uses an existing Playwright installation; no project dependency is added.
const {chromium}=require(process.argv[2] || 'playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes,randomInt}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const password=randomBytes(20).toString('base64url'),port=String(randomInt(20000,60000)),base=`http://127.0.0.1:${port}`;
 const out=path.join(require('node:os').tmpdir(),'contas-seven-validation');fs.mkdirSync(out,{recursive:true});
 const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/controlled-dev.ts','--isolated'],{env:{...process.env,CONTAS_TATU_TEST_PASSWORD:password,CONTAS_TATU_LOCAL_PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let browser;let stderr='';app.stderr.on('data',d=>stderr+=d);
 try {
  await new Promise((resolve,reject)=>{app.stdout.on('data',d=>{if(d.toString().includes('Controlled isolated'))resolve();});app.on('exit',()=>reject(new Error(stderr)));setTimeout(()=>reject(new Error('Server timeout: '+stderr)),60000).unref();});
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function login(name){await page.goto(base);await page.getByLabel('Usuário',{exact:true}).fill(name);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByLabel('Lembrar login').check();const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Entrar',exact:true}).click();assert.equal((await response).status(),200,'Login must succeed before testing Seven');await page.getByRole('button',{name:'Menu',exact:true}).waitFor();}
  await login('Henrique');
  const homeSeven=page.getByRole('navigation',{name:'Lançamentos'}).getByRole('button',{name:/Comprovante Seven/});
  await homeSeven.waitFor();
  for(const width of [360,393]) {
   await page.setViewportSize({width,height:852});
   await homeSeven.scrollIntoViewIfNeeded();
   assert.equal(await homeSeven.isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`seven-home-${width}.png`),fullPage:true});
  }
  await homeSeven.click();
  const area=page.getByRole('region',{name:'Comprovante Seven'});
  await area.getByText('Nenhuma despesa neste mês.').waitFor();
  await area.getByRole('button',{name:'Nova despesa',exact:true}).click();
  await area.getByLabel('Descrição',{exact:true}).fill('Uber');await area.getByLabel('Cliente/local',{exact:true}).fill('Cliente X');
  await area.getByLabel('Data',{exact:true}).fill('2026-11-26');await area.getByLabel('Valor (R$)',{exact:true}).fill('27,50');
  const buffer=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
  await area.getByLabel('Imagens/prints',{exact:true}).setInputFiles([{name:'uber-1.png',mimeType:'image/png',buffer},{name:'uber-2.png',mimeType:'image/png',buffer}]);
  await area.getByRole('button',{name:'Remover imagem 2',exact:true}).waitFor();
  await area.getByLabel('Título do comprovante 1 (cliente)',{exact:true}).fill('Cliente Seven — Uber');
  await area.getByRole('button',{name:'Salvar despesa',exact:true}).click();await area.getByText('Despesa salva.',{exact:true}).waitFor();
  await area.getByText(/Total mensal:.*27,50/).waitFor();assert.equal(await area.getByText(/2 print\(s\)/).count(),1);
  await area.getByRole('button',{name:'Ver comprovantes',exact:true}).click();await area.getByRole('img',{name:'Comprovante 2: uber-2.png',exact:true}).waitFor();
  assert.ok(await area.getByRole('img',{name:'Comprovante 1: Cliente Seven — Uber',exact:true}).evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(out,'mobile-prints.png'),fullPage:true});
  await area.getByRole('button',{name:'Editar despesa',exact:true}).click();assert.equal(await area.getByLabel('Título do comprovante 1 (cliente)',{exact:true}).inputValue(),'Cliente Seven — Uber');await area.getByLabel('Título do comprovante 1 (cliente)',{exact:true}).fill('Cliente Seven — Corrigido');await area.getByLabel('Valor (R$)',{exact:true}).fill('30,10');
  await area.getByRole('button',{name:'Remover imagem 2',exact:true}).click();await area.getByRole('button',{name:'Salvar despesa',exact:true}).click();await area.getByText(/Total mensal:.*30,10/).waitFor();
  await area.getByTitle('Mês anterior',{exact:true}).click();await area.getByText('Nenhuma despesa neste mês.').waitFor();await area.getByText(/Total mensal:.*0,00/).waitFor();
  await area.getByTitle('Próximo mês',{exact:true}).click();await area.getByText(/Total mensal:.*30,10/).waitFor();
  const downloading=page.waitForEvent('download');await area.getByRole('button',{name:'Relatório mensal',exact:true}).click();const download=await downloading;
  const reportPath=path.join(out,download.suggestedFilename());await download.saveAs(reportPath);const html=fs.readFileSync(reportPath,'utf8');assert.ok(html.includes('30,10'));assert.ok(html.includes('data:image/png;base64,'));assert.ok(html.includes('Cliente X'));assert.ok(html.includes('Cliente Seven — Corrigido'));
  const report=await context.newPage();await report.goto(require('node:url').pathToFileURL(reportPath).href);assert.equal(await report.locator('img').count(),1);assert.ok(await report.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0));await report.close();
  for(const width of [360,393,1440]) {
   await page.setViewportSize({width,height:900});
   if(width===1440)await page.locator('#tab-seven').click();
   await area.getByText(/Total mensal:.*30,10/).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
   await page.screenshot({path:path.join(out,`seven-${width}.png`),fullPage:true});
  }
  page.once('dialog',d=>d.accept());await area.getByRole('button',{name:'Excluir',exact:true}).click();await area.getByText('Nenhuma despesa neste mês.').waitFor();
  await page.getByRole('button',{name:'Sair',exact:true}).click();await page.setViewportSize({width:393,height:852});
  await login('Jessica');
  assert.equal(await page.getByRole('navigation',{name:'Lançamentos'}).getByRole('button',{name:/Comprovante Seven/}).count(),0);
  await page.getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Comprovante Seven',exact:true}).count(),0);
  assert.equal((await context.request.get(base+'/api/seven?month=2026-11')).status(),403);
  await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});await page.locator('#tab-dashboard').waitFor();assert.equal(await page.locator('#tab-seven').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: mobile/desktop CRUD, uploads, image rendering, monthly filter/total, downloaded report, Henrique-only UI/API. Screenshots: '+out);
 } finally {if(browser)await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
