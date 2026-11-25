// Fresh `npm run dev:isolated`; writes are refused without its isolated-PGlite marker.
// node tests/mobile-browser-validation.cjs [playwright path] [chromium|webkit] [output dir]
const playwright = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const engine = process.argv[3] || 'chromium';
const output = process.argv[4] || path.join(require('node:os').tmpdir(), 'contas-mobile-' + engine);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await playwright[engine].launch(engine === 'chromium' ? { channel: 'msedge', headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const base = 'http://127.0.0.1:3100'; const marker = await context.request.get(base + '/api/finance?month=2026-09');
  assert.equal(marker.headers()['x-contas-tatu-isolated'], 'true', 'Refusing test writes outside PGlite');
  const page = await context.newPage(); const errors = []; const flows = []; const sizes = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-09-28T12:00:00-03:00'));
  const storageKey = 'organizacao_financeira_store_v1';
  await page.addInitScript(key => { localStorage.setItem(key, '{"preserved":"legacy"}'); }, storageKey);
  const read = async (month = '2026-09') => (await context.request.get(base + '/api/finance?month=' + month)).json();
  const run = async (action, data, month = '2026-09') => {
    const view = await read(month); const response = await context.request.post(base + '/api/finance/commands', { data: { action, data, month, expectedRevision: view.revision } });
    assert.equal(response.status(), 200); return response.json();
  };
  const settled = async () => { await page.locator('[data-testid=mobile-app]').waitFor(); await page.getByText('Buscando seus lançamentos…', { exact: true }).waitFor({ state: 'hidden' }); };
  const shot = async name => { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); };
  const geometry = async () => {
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const controls = [...document.querySelectorAll('.mobile-app button,.mobile-sheet[open] button')].filter(visible);
      const fields = [...document.querySelectorAll('.mobile-form input,.mobile-form select')].filter(visible);
      return { overflow: root.scrollWidth > innerWidth + 1, undersized: controls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 43 || r.width < 43; }).map(e => e.textContent.trim()), smallFonts: fields.filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length };
    });
    assert.equal(result.overflow, false); assert.deepEqual(result.undersized, []); assert.equal(result.smallFonts, 0);
  };
  const home = async () => { await page.goto(base); await settled(); };
  const choose = async name => { await page.getByRole('button', { name: 'Adicionar conta', exact: true }).first().click(); await page.getByRole('button', { name, exact: false }).click(); };
  const save = async label => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('button', { name: 'Voltar para o início', exact: true }).waitFor(); };
  try {
    await home();
    const initial = await read(); if (!initial.accounts.length) assert.ok(await page.getByText('Tudo leve por aqui').isVisible());
    await run('card.create', { name: 'Cartão mobile ' + engine }); const card = (await read()).state.creditCards.find(c => c.name === 'Cartão mobile ' + engine);
    await home();
    for (const [width, height] of [[375,812],[390,844],[393,852],[414,896],[430,932]]) {
      await page.setViewportSize({ width, height }); await home();
      const add = await page.getByRole('button', { name: 'Adicionar conta', exact: true }).boundingBox(); assert.ok(add.y + add.height < height);
      assert.equal(await page.locator('.app-sidebar,#tab-history,.history-page,#btn-settings-header').count(), 0);
      await geometry(); await shot(width + '-home');
      await choose('Conta Uma despesa'); await geometry(); await shot(width + '-account');
      await page.getByLabel('Descrição', { exact: true }).fill('Campo com teclado');
      await page.setViewportSize({ width, height: 440 }); await page.getByLabel('Valor', { exact: true }).focus(); await geometry();
      await page.getByRole('button', { name: 'Adicionar conta', exact: true }).scrollIntoViewIfNeeded();
      const button = await page.getByRole('button', { name: 'Adicionar conta', exact: true }).boundingBox(); assert.ok(button.y >= 0 && button.y + button.height <= 440);
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Voltar', exact: true }).click();
      await page.getByRole('button', { name: 'Compra no cartão À vista' }).click(); await page.getByRole('button', { name: 'Parcelado', exact: true }).click(); await geometry(); await shot(width + '-card');
      await page.getByRole('button', { name: 'Voltar', exact: true }).click(); await page.getByRole('button', { name: 'Parcelamento Com ou sem' }).click(); await geometry(); await shot(width + '-installment');
      await home(); await page.getByRole('button', { name: 'Ver todos', exact: false }).click(); await page.getByRole('button', { name: 'Setembro 2026', exact: false }).click(); await geometry(); await shot(width + '-months'); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      sizes.push({ width, height, passed: true, keyboardViewport: 'simulated 440px' });
    }
    flows.push('Five mobile sizes: home, selector, all forms, month sheet, 44px targets, 16px inputs, no horizontal overflow; keyboard-height simulation');
    await page.setViewportSize({ width: 393, height: 852 }); await home();
    const name = 'Mercado ' + engine;
    await choose('Conta Uma despesa'); await page.getByLabel('Descrição', { exact: true }).fill(name); await page.getByLabel('Valor', { exact: true }).fill('186,40'); await page.getByRole('switch').check();
    let posts = 0; page.on('request', r => { if (r.url().endsWith('/api/finance/commands') && r.method() === 'POST') posts++; });
    await page.getByRole('button', { name: 'Adicionar conta', exact: true }).dblclick();
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).waitFor();
    assert.equal(posts, 1); let store = (await read()).state;
    assert.equal(store.simpleAccounts.filter(a => a.name === name).length, 1); assert.equal(store.simpleAccounts.find(a => a.name === name).status, 'pago');
    for (const [width,height] of [[393,852],[414,896]]) { await page.setViewportSize({width,height}); await geometry(); await shot(width+'-success'); }
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(name) }).click(); await shot('414-actions'); await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Valor', { exact: true }).fill('200'); await page.getByRole('switch').uncheck(); await save('Salvar alterações');
    store = (await read()).state; assert.equal(store.simpleAccounts.find(a => a.name === name).status, 'pendente');
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).click(); await page.getByRole('button', { name: new RegExp(name) }).click(); await page.getByRole('button', { name: 'Marcar como paga', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await read()).state.simpleAccounts.find(a => a.name === name).status, 'pago');
    flows.push('Paid create is atomic; duplicate click sends one command; success, quick edit and payment persist through API');
    await choose('Compra no cartão À vista'); await page.getByLabel('Descrição', { exact: true }).fill('Compra ' + engine); await page.getByLabel('Valor', { exact: true }).fill('35,90'); await page.getByLabel('Cartão', { exact: true }).selectOption(card.id); await save('Adicionar compra');
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).click(); await choose('Compra no cartão À vista');
    await page.getByLabel('Descrição', { exact: true }).fill('Compra parcelada ' + engine); await page.getByLabel('Valor', { exact: true }).fill('120'); await page.getByLabel('Cartão', { exact: true }).selectOption(card.id); await page.getByRole('button', { name: 'Parcelado', exact: true }).click(); await page.getByLabel('Número de parcelas', { exact: false }).fill('3'); await save('Adicionar compra');
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).click(); await choose('Parcelamento Com ou sem');
    await page.getByLabel('Descrição', { exact: true }).fill('Plano ' + engine); await page.getByLabel('Valor total', { exact: true }).fill('300'); await page.getByLabel('Número de parcelas', { exact: false }).fill('3'); await save('Adicionar parcelamento');
    await page.getByRole('button', { name: 'Voltar para o início', exact: true }).click(); await page.getByRole('button', { name: new RegExp('Plano ' + engine) }).click(); await page.getByRole('button', { name: 'Editar', exact: true }).click(); await page.getByText('Essa alteração precisa ser feita pelo Contas Tatu no computador.').waitFor(); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    flows.push('Existing-card cash/parcelled purchase and standalone installment; advanced edits stay desktop-only');
    await page.getByRole('button', { name: 'Ver todos', exact: false }).click(); await page.getByRole('button', { name: 'Setembro 2026' }).click(); await page.getByRole('button', { name: 'Agosto 2026' }).click(); await settled();
    await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click(); await page.getByRole('button', { name: 'Conta Uma despesa' }).click(); assert.equal(await page.getByLabel('Mês', { exact: true }).inputValue(), '2026-08');
    flows.push('Monthly list and sheet share the existing month selection');
    await home(); await choose('Conta Uma despesa'); await page.getByLabel('Descrição', { exact: true }).fill('Não duplicar'); await page.getByLabel('Valor', { exact: true }).fill('1');
    await run('simple.create', { name: 'Concorrente ' + engine, value: 2 }); await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'outra sessão' }).waitFor();
    assert.equal(await page.getByLabel('Descrição', { exact: true }).inputValue(), 'Não duplicar'); assert.equal((await read()).state.simpleAccounts.some(a => a.name === 'Não duplicar'), false);
    flows.push('Conflict preserves draft, reloads state and never silently repeats command');
    // Production-like denied API: UI remains accessible, no fake confirmation or fallback storage.
    await page.route('**/api/**', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Controlled local access only"}' }));
    await home(); await choose('Conta Uma despesa'); await page.getByLabel('Descrição', { exact: true }).fill('Bloqueada'); await page.getByLabel('Valor', { exact: true }).fill('1'); await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'acesso autenticado' }).waitFor(); await shot('production-blocked');
    assert.equal(await page.evaluate(k => localStorage.getItem(k), storageKey), '{"preserved":"legacy"}');
    await page.unroute('**/api/**');
    await page.route('**/api/finance?*', async route => { await new Promise(r => setTimeout(r, 600)); await route.fulfill({ status: 500, body: '{"error":"raw-sensitive-error"}' }); });
    await page.goto(base); await page.getByText('Buscando seus lançamentos…', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).waitFor(); assert.ok(!(await page.locator('body').innerText()).includes('raw-sensitive-error')); await page.unroute('**/api/finance?*'); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await settled();
    flows.push('Loading, sanitized network error, recovery and Production-like 403; no localStorage writes or migration');
    await page.setViewportSize({ width: 768, height: 1024 }); await page.locator('#tab-dashboard').waitFor(); assert.equal(await page.locator('[data-testid=mobile-app]').count(), 0); await shot('768-desktop');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.locator('#tab-history').click(); await page.locator('.history-page').waitFor(); await shot('1440-desktop');
    assert.deepEqual(errors, []); flows.push('768px and 1440px retain desktop navigation and history');
    const report = { passed: true, engine, sizes, flows, physicalSafariKeyboard: 'not emulated', output };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
