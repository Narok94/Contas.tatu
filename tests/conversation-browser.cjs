const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const context = await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:3100';
 const response=await context.request.get(base+'/api/finance?month=2026-09');
 assert.equal(response.headers()['x-contas-tatu-isolated'],'true');
 let posts=0; page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/commands')) posts++;});
 try {
  await page.goto(base); await page.getByRole('log').waitFor();
  await page.getByRole('textbox',{name:'Digite sua conta'}).fill('luz 200');
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByRole('heading',{name:'Conta de luz'}).waitFor(); assert.equal(posts,0);
  for(const [width,height] of [[393,852],[414,896]]) {
   await page.setViewportSize({width,height});
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth, input:parseFloat(getComputedStyle(document.querySelector('.chat-composer input')).fontSize), bottom:document.querySelector('.chat-composer').getBoundingClientRect().bottom, small:[...document.querySelectorAll('.chat-app button')].filter(b=>b.getBoundingClientRect().height<43).length}));
   assert.equal(geometry.overflow,false); assert.ok(geometry.input>=16); assert.ok(geometry.bottom<=height); assert.equal(geometry.small,0);
   await page.screenshot({path:`${process.env.TEMP}/tatu-chat-${width}.png`});
  }
  await page.setViewportSize({width:393,height:440});
  await page.getByRole('textbox',{name:'Digite sua conta'}).focus();
  assert.ok(await page.locator('.chat-composer').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  await page.setViewportSize({width:393,height:852});
  await page.getByRole('button',{name:'Adicionar',exact:true}).evaluate(b=>{b.click();b.click();});
  await page.getByText('✓ Conta adicionada com sucesso',{exact:true}).waitFor(); assert.equal(posts,1);
  await page.getByLabel('Autor local de teste').selectOption('Jessica');
  await page.getByRole('textbox',{name:'Digite sua conta'}).fill('gasolina 120'); await page.getByRole('button',{name:'Enviar',exact:true}).click();
  assert.equal(await page.locator('.local-jessica .chat-byline b').textContent(),'Jessica');
  await page.getByRole('button',{name:'Corrigir',exact:true}).click(); await page.getByLabel('Descrição',{exact:true}).fill('Gasolina corrigida');
  await page.getByRole('button',{name:'Adicionar conta',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'}); assert.equal(posts,2);
  await page.getByRole('heading',{name:'Gasolina corrigida',exact:true}).waitFor();
  await page.getByRole('button',{name:'＋ Geral',exact:true}).click();
  await page.getByRole('button',{name:'Compra no cartão À vista'}).waitFor(); assert.equal(await page.getByText('Histórico',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Voltar',exact:true}).click(); await page.getByRole('log').waitFor();
  await page.getByRole('button',{name:'Menu',exact:true}).click(); await page.getByRole('button',{name:'Contas deste mês',exact:true}).click(); await page.getByRole('heading',{name:'Contas deste mês'}).waitFor();
  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  await page.setViewportSize({width:1280,height:900}); await page.locator('.app-sidebar').waitFor(); assert.equal(await page.getByRole('log').count(),0);
  await page.setViewportSize({width:393,height:852}); await page.getByRole('log').waitFor();
  await page.route('**/api/finance**',route=>route.fulfill({status:403,body:'{}'})); await page.reload();
  await page.getByRole('textbox',{name:'Digite sua conta'}).fill('luz 200'); await page.getByRole('button',{name:'Enviar',exact:true}).click(); await page.getByRole('button',{name:'Adicionar',exact:true}).click(); await page.getByRole('alert').waitFor(); assert.equal(posts,2);
  assert.deepEqual(errors,[]); console.log('PASS: iPhone 393/414, overflow, composer, keyboard viewport simulation, confirmation, duplicate prevention, authors, correction, Geral, monthly list, desktop, protected API.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
