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
    const name = 'Extrato desktop ' + Date.now();
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
    const statement = page.locator('.card-details-page');
    const open = async () => { await trigger.click(); await statement.waitFor(); };
    const back = async () => {
      await statement.getByRole('button', { name: 'Voltar para Contas' }).click();
      await statement.waitFor({ state: 'detached' });
      await trigger.waitFor();
      await page.waitForFunction(id => document.activeElement?.id === id, await trigger.getAttribute('id'));
    };
    const noModal = async () => {
      assert.equal(await page.locator('dialog[open], [aria-modal="true"], .card-details-dialog').count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.locator('#desktop-navigation').isVisible(), true);
      assert.equal(await page.locator('.app-toolbar').isVisible(), true);
    };
    const geometry = await tile.boundingBox();
    await page.locator('#toggle-account-filters').click();
    await page.locator('#filter-type-card').click();
    const initialState = await read('2026-10');
    await open(); await noModal();
    const entries = statement.locator('.card-statement-entry');
    const summary = statement.locator('.card-statement-summary');
    const search = statement.getByRole('searchbox', { name: 'Buscar por descrição' });
    assert.equal(await entries.count(), 2);
    assert.match(await summary.innerText(), /125,00/);
    assert.match(await summary.innerText(), /2 lançamentos/);
    assert.equal(await statement.locator('thead th').allTextContents().then(cols => cols.join('|')), 'Data da compra|Descrição|Parcela|Valor');
    const simple = entries.filter({ hasText: 'Compra simples teste' });
    const installment = entries.filter({ hasText: 'Notebook parcelado teste' });
    assert.equal(await simple.locator('td').nth(2).innerText(), '—');
    assert.equal(await installment.locator('td').nth(2).innerText(), '1/3');
    assert.match(await simple.locator('td').last().innerText(), /25,00/);
    assert.match(await installment.locator('td').last().innerText(), /100,00/);
    assert.equal(await simple.locator('td').first().innerText(), 'Data não informada');
    assert.equal(await statement.getByRole('button').count(), 1, 'Statement is read-only');
    await search.fill('  SIMPLES  '); assert.equal(await entries.count(), 1);
    assert.match(await statement.locator('[role="status"]').innerText(), /1 resultado/);
    assert.match(await summary.innerText(), /2 lançamentos/);
    assert.match(await summary.innerText(), /125,00/);
    await search.fill('inexistente'); assert.equal(await entries.count(), 0);
    await statement.getByText('Nenhum lançamento encontrado para esta busca.').waitFor();
    await search.fill(''); assert.equal(await entries.count(), 2);
    await back();
    assert.equal(await page.locator('#toggle-account-filters').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#filter-type-card').getAttribute('aria-pressed'), 'true');
    await page.locator('#filter-type-all').click();
    await page.locator('#toggle-account-filters').click();
    assert.deepEqual(await tile.boundingBox(), geometry);
    for (let i = 0; i < 3; i++) { await open(); await back(); }
    // Both dock paths must leave the statement, including the current Contas tab.
    await open(); await page.locator('#tab-accounts').click(); await trigger.waitFor();
    assert.equal(await statement.count(), 0);
    await open(); await page.locator('#tab-dashboard').click();
    await statement.waitFor({ state: 'detached' });
    await page.locator('#tab-accounts').click(); await trigger.waitFor();
    assert.equal(await statement.count(), 0);
    assert.deepEqual(await read('2026-10'), initialState);
    for (let i = 0; i < 50; i++) await run('expense.create', { cardId: id, description: 'Uber teste ' + i, amount: 10 });
    await home();
    const seededState = await read('2026-10');
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await open(); await noModal();
      assert.equal(await entries.count(), 52);
      const main = await page.locator('main').boundingBox();
      const table = await statement.locator('table').boundingBox();
      assert.ok(table.width > main.width * 0.94, 'Use nearly all main width');
      const heading = await statement.locator('header').boundingBox();
      assert.ok(heading.height < 95, 'Compact summary');
      const visibleRows = await entries.evaluateAll(rows => rows.filter(row => { const r = row.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length);
      assert.ok(visibleRows >= 10, 'Many rows visible: ' + visibleRows);
      assert.equal(await statement.evaluate(el => el.scrollHeight <= el.clientHeight), true, 'No nested vertical scrolling');
      await page.screenshot({ path: join(tmpdir(), 'contas-card-page-' + width + '.png') });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      assert.ok(await page.evaluate(() => window.scrollY > 400));
      assert.equal(await statement.locator('thead').evaluate(el => Math.abs(el.getBoundingClientRect().top) < 2), true, 'Sticky table heading');
      await page.evaluate(() => window.scrollTo(0, 0));
      await search.fill('uber'); assert.equal(await entries.count(), 50);
      await back();
    }
    await open();
    await page.locator('#btn-next-month').click();
    await statement.getByText('Compra novembro', { exact: true }).waitFor();
    assert.equal(await entries.count(), 2);
    assert.equal(await entries.filter({ hasText: 'Notebook parcelado teste' }).locator('td').nth(2).innerText(), '2/3');
    assert.match(await statement.locator('header').innerText(), /Novembro 2026/);
    await page.locator('#btn-prev-month').click();
    await page.waitForFunction(() => document.querySelectorAll('.card-statement-entry').length === 52);
    assert.equal(await page.locator('#desktop-sidebar,.sidebar-toggle').count(), 0);
    assert.equal(await page.locator('#tab-accounts').getAttribute('aria-current'), 'page');
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-testid="mobile-app"]').waitFor();
    assert.equal(await statement.count(), 0);
    assert.equal(await page.locator('[id^="btn-expand-card-"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#tab-accounts').waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.locator('#tab-accounts').click(); await trigger.waitFor();
    assert.equal(await statement.count(), 0);
    assert.deepEqual(await read('2026-10'), seededState);
    assert.equal(writes, 0, 'View/search/navigation must never send financial writes');
    const emptyName = 'Cartão vazio ' + Date.now();
    await run('card.create', { name: emptyName });
    await home();
    const emptyTile = page.locator('[id^="credit-card-"]').filter({ has: page.getByRole('heading', { name: emptyName, exact: true }) });
    await emptyTile.getByRole('button', { name: 'Ver detalhes' }).click();
    await statement.getByText('Nenhuma compra lançada nesta fatura').waitFor();
    assert.match(await summary.innerText(), /0 lançamentos/);
    await statement.getByRole('button', { name: 'Voltar para Contas' }).click();
    assert.deepEqual(errors, []);
    console.log('PASS: internal desktop page, no modal/overlay/scroll lock, back/dock navigation, real totals/counts, simple/installment columns, missing purchase date, search, empty state, 1366/1440/1920 width/visible rows, document scroll/sticky headings, month selection, unchanged cards/mobile, zero financial writes and unchanged persisted state.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
