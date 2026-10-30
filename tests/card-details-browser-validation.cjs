// Start npm run dev:isolated with CONTAS_TATU_TEST_PASSWORD, then run:
// node tests/card-details-browser-validation.cjs [playwright module path] [base URL]
// All writes require the isolated PGlite response marker.
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

(async () => {
  const base = process.argv[3] || 'http://127.0.0.1:3100';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: base } });
    const marker = await context.request.get(base + '/api/auth/session');
    assert.equal(marker.headers()['x-contas-tatu-isolated'], 'true', 'Refusing writes outside isolated PGlite');
    const login = await context.request.post(base + '/api/auth/login', { data: {
      login: 'henrique', password: process.env.CONTAS_TATU_TEST_PASSWORD, remember: true,
    } });
    assert.equal(login.status(), 200);
    const read = async month => (await context.request.get(base + '/api/finance?month=' + month)).json();
    const run = async (action, data, month = '2026-10') => {
      const view = await read(month);
      const response = await context.request.post(base + '/api/finance/commands', {
        data: { action, data, month, expectedRevision: view.revision },
      });
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    };
    const name = 'Modal desktop ' + Date.now();
    await run('card.create', { name });
    const id = (await read('2026-10')).state.creditCards.find(card => card.name === name).id;
    await run('expense.create', { cardId: id, description: 'Compra simples teste', amount: 25 });
    await run('installment.create', { creditCardId: id, description: 'Notebook parcelado teste', totalAmount: 300, installmentsCount: 3 });
    await run('expense.create', { cardId: id, description: 'Compra novembro', amount: 7 }, '2026-11');
    const page = await context.newPage();
    const errors = [];
    let writes = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/finance')) writes++; });
    await page.clock.setFixedTime(new Date('2026-10-30T12:00:00-03:00'));
    const home = async () => { await page.goto(base); await page.locator('#tab-accounts').click(); await page.getByRole('heading', { name, exact: true }).waitFor(); };
    await home();
    const tile = page.locator('[id^="credit-card-"]').filter({ has: page.getByRole('heading', { name, exact: true }) });
    const trigger = tile.getByRole('button', { name: 'Ver detalhes' });
    const dialog = page.locator('.card-details-dialog');
    const open = async () => { await trigger.click(); await dialog.waitFor(); };
    const closed = async () => {
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    };
    const before = await tile.boundingBox();
    const initialState = await read('2026-10');
    await open();
    const entries = dialog.locator('.card-details-entry');
    assert.equal(await entries.count(), 2);
    assert.match(await dialog.locator('.card-details-summary').innerText(), /125,00/);
    assert.match(await dialog.locator('.card-details-summary').innerText(), /2 compras/);
    assert.equal(await dialog.locator('thead th').allTextContents().then(cols => cols.join('|')), 'Data da compra|Descrição|Parcela|Valor');
    const simple = entries.filter({ hasText: 'Compra simples teste' });
    const installment = entries.filter({ hasText: 'Notebook parcelado teste' });
    assert.equal(await simple.locator('td').nth(2).innerText(), '—');
    assert.equal(await installment.locator('td').nth(2).innerText(), '1/3');
    assert.match(await simple.locator('td').last().innerText(), /25,00/);
    assert.match(await installment.locator('td').last().innerText(), /100,00/);
    // There is no purchase day in the current model. Do not invent one from createdAt.
    assert.equal(await dialog.locator('.card-details-date-group').innerText(), 'Data não informada');
    assert.equal(await simple.locator('td').first().innerText(), '—');
    assert.equal(await dialog.getByRole('button').count(), 1, 'Statement must be read-only');
    assert.deepEqual(await tile.boundingBox(), before);
    const search = dialog.getByRole('searchbox', { name: 'Buscar por descrição' });
    await search.fill('  SIMPLES  '); assert.equal(await entries.count(), 1);
    assert.match(await dialog.locator('[role="status"]').innerText(), /1 lançamento/);
    assert.match(await dialog.locator('.card-details-summary').innerText(), /2 compras/);
    assert.match(await dialog.locator('.card-details-summary').innerText(), /125,00/);
    await search.fill('inexistente'); assert.equal(await entries.count(), 0);
    await dialog.getByText('Nenhum lançamento encontrado para esta busca.').waitFor();
    await search.fill(''); assert.equal(await entries.count(), 2);
    await dialog.getByRole('button', { name: 'Fechar detalhes do cartão' }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.locator('[role="region"]').evaluate(el => el === document.activeElement), true);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
    }
    await page.keyboard.press('Escape'); await closed();
    await open(); await page.mouse.click(8, 8); await closed();
    await open(); await dialog.getByRole('button', { name: 'Fechar detalhes do cartão' }).click(); await closed();
    for (let i = 0; i < 3; i++) { await open(); await page.keyboard.press('Escape'); await closed(); }
    assert.deepEqual(await read('2026-10'), initialState);
    for (let i = 0; i < 35; i++) await run('expense.create', { cardId: id, description: 'Uber teste ' + i, amount: 10 });
    await home();
    const seededState = await read('2026-10');
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const geometry = await tile.boundingBox();
      await open();
      assert.equal(await entries.count(), 37);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 31 && bounds.y >= 31);
      // The existing desktop shell reserves a stable scrollbar gutter.
      const availableWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
      assert.ok(Math.abs(bounds.x * 2 + bounds.width - availableWidth) < 2);
      assert.ok(Math.abs(bounds.y * 2 + bounds.height - height) < 2);
      assert.equal(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight), true);
      const content = dialog.locator('.card-details-content');
      const header = await dialog.locator('header').boundingBox();
      const summary = await dialog.locator('.card-details-summary').boundingBox();
      assert.equal(await content.evaluate(el => el.scrollHeight > el.clientHeight), true);
      await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.deepEqual(await dialog.locator('header').boundingBox(), header);
      assert.deepEqual(await dialog.locator('.card-details-summary').boundingBox(), summary);
      await page.screenshot({ path: join(tmpdir(), 'contas-card-statement-' + width + '.png') });
      await search.fill('uber'); assert.equal(await entries.count(), 35);
      await page.keyboard.press('Escape'); await closed();
      assert.deepEqual(await tile.boundingBox(), geometry);
    }
    await page.locator('#btn-next-month').click(); await open();
    await dialog.getByText('Compra novembro', { exact: true }).waitFor();
    assert.equal(await entries.count(), 2);
    assert.equal(await entries.filter({ hasText: 'Notebook parcelado teste' }).locator('td').nth(2).innerText(), '2/3');
    await page.keyboard.press('Escape'); await closed();
    await page.locator('#btn-prev-month').click(); await open();
    assert.equal(await entries.count(), 37);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-testid="mobile-app"]').waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(await page.locator('[id^="btn-expand-card-"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#tab-accounts').waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(await read('2026-10'), seededState);
    assert.equal(writes, 0, 'Viewing, searching and closing must never send financial writes');
    const emptyName = 'Cartão vazio ' + Date.now();
    await run('card.create', { name: emptyName });
    await home();
    const emptyTile = page.locator('[id^="credit-card-"]').filter({ has: page.getByRole('heading', { name: emptyName, exact: true }) });
    await emptyTile.getByRole('button', { name: 'Ver detalhes' }).click();
    await dialog.getByText('Nenhuma compra lançada nesta fatura').waitFor();
    assert.match(await dialog.locator('.card-details-summary').innerText(), /0 compras/);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS: read-only statement, real totals/counts, simple/installment columns, missing purchase date fallback, local search, empty state, 1366/1440/1920 geometry, internal scroll, X/ESC/backdrop, focus trap/return, month selection, unchanged cards/mobile, zero financial writes and unchanged persisted state.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
