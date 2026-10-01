const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {existsSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const modulePath=process.argv[2]||process.env.PATH.split(path.delimiter).map(p=>path.resolve(p,'../playwright')).find(p=>existsSync(path.join(p,'index.js')));
const {chromium}=require(modulePath);
(async()=>{
 const password=randomBytes(20).toString('base64url'),port='3104';
 const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/controlled-dev.ts','--isolated'],{env:{...process.env,CONTAS_TATU_TEST_PASSWORD:password,CONTAS_TATU_LOCAL_PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const ready=new Promise((resolve,reject)=>{app.stdout.on('data',d=>{if(d.toString().includes('Controlled isolated'))resolve();});app.stderr.on('data',d=>process.stderr.write(d));app.on('exit',()=>reject(new Error('Server stopped')));setTimeout(()=>reject(new Error('Server timeout')),30000).unref();});
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${port}`);await page.getByPlaceholder('Seu usuário').fill('Henrique');await page.getByPlaceholder('Sua senha').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.locator('#btn-settings-header').click();const section=page.getByRole('region',{name:'Segurança dos dados'});
  await section.getByText(/configuração administrativa/).waitFor();assert.equal(await section.getByRole('button').count(),2);
  for(const button of await section.getByRole('button').all())assert.equal(await button.isDisabled(),true);
  await page.getByText('Categorias / Tags',{exact:true}).waitFor();
  const out=path.join(process.env.TEMP,'contas-tatu-backup');mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'desktop-blocked.png')});
  await page.getByLabel('Fechar configurações').click();
  let creates=0,lists=0,operations=0,fail=false;
  const snapshot={id:'snap-test',name:'safe',createdAt:'2026-10-01T12:00:00Z',expiresAt:null};
  await page.route('**/api/backup**',async route=>{
   const req=route.request(),url=new URL(req.url());let body;
   if(url.searchParams.get('view')==='status')body={available:true};
   else if(fail){await route.fulfill({status:503,json:{code:'BACKUP_FAILED',error:'synthetic-secret-private'}});return;}
   else if(req.method()==='POST'){creates++;assert.equal(req.postData(),'{}');body={snapshot,operations:[{id:'op-test',status:'running'}]};}
   else if(url.searchParams.has('operation')){operations++;body={id:'op-test',status:'finished'};}
   else {lists++;body={snapshots:[snapshot]};}
   await route.fulfill({status:req.method()==='POST'?202:200,json:body});
  });
  await page.locator('#btn-settings-header').click();const create=section.getByRole('button',{name:'Criar ponto seguro'});
  await create.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Criar ponto seguro')?.disabled);
  await create.dblclick();await section.getByText('Ponto seguro criado.',{exact:true}).waitFor();assert.equal(creates,1);assert.equal(operations,1);
  await section.getByRole('button',{name:'Ver pontos salvos'}).click();await section.getByRole('list',{name:'Pontos salvos'}).waitFor();assert.equal(lists,1);assert.equal(await section.locator('li').count(),1);
  await page.screenshot({path:path.join(out,'desktop-points.png')});
  fail=true;await create.click();await section.getByText(/Não foi possível concluir/).waitFor();assert.ok(!(await section.innerText()).includes('synthetic-secret-private'));
  await page.getByLabel('Fechar configurações').click();await page.locator('#tab-dashboard').click();assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log('PASS: desktop settings/categories, missing admin blocks both actions, creation once, asynchronous completion, listing, sanitized failure, dashboard navigation; screenshots '+out);
 }finally{if(browser)await browser.close();app.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
