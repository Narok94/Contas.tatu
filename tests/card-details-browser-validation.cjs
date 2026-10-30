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
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
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
    assert.equal(await page.locator('.card-purchase-row').count(), 0);
    await open();
    assert.equal(await dialog.locator('.card-purchase-row').count(), 2);
    assert.match(await dialog.innerText(), /1\/3/);
    assert.match(await dialog.innerText(), /125,00/);
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.locator('button').last().evaluate(el => el === document.activeElement), true);
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
    }
    assert.deepEqual(await tile.boundingBox(), before);
    await page.keyboard.press('Escape'); await closed();
    await open(); await page.mouse.click(8, 8); await closed();
    await open(); await dialog.getByRole('button', { name: 'Fechar detalhes do cartão' }).click(); await closed();
    for (let i = 0; i < 3; i++) { await open(); await page.keyboard.press('Escape'); await closed(); }
    // Reuse the existing simple purchase editor and delete confirmation.
    await open();
    await dialog.locator('.card-purchase-row').filter({ hasText: 'Compra simples teste' }).getByTitle('Editar compra da fatura').click();
    await page.locator('#card-purchase-modal-box').waitFor();
    assert.equal(await dialog.count(), 0);
    await page.locator('#card-purchase-modal-box input[type="text"]').first().fill('Compra simples editada');
    await page.locator('#btn-save-card-purchase').click();
    await page.locator('#card-purchase-modal-box').waitFor({ state: 'hidden' });
    await open();
    await dialog.getByText('Compra simples editada', { exact: true }).waitFor();
    await dialog.locator('.card-purchase-row').filter({ hasText: 'Notebook parcelado teste' }).getByTitle('Editar compra da fatura').click();
    await page.locator('#card-purchase-modal-box').waitFor();
    assert.equal(await page.locator('#card-purchase-modal-box input[type="number"]').count() > 0, true);
    await page.locator('#card-purchase-modal-box').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await open();
    await dialog.locator('.card-purchase-row').filter({ hasText: 'Compra simples editada' }).getByTitle('Excluir compra da fatura').click();
    await page.locator('#confirm-modal-box').waitFor();
    await page.locator('#btn-confirm-cancel').click();
    await open();
    await dialog.locator('.card-purchase-row').filter({ hasText: 'Compra simples editada' }).getByTitle('Excluir compra da fatura').click();
    await page.locator('#btn-confirm-action').click();
    await page.locator('#confirm-modal-box').waitFor({ state: 'hidden' });
    await open(); assert.equal(await dialog.locator('.card-purchase-row').count(), 1);
    await page.keyboard.press('Escape'); await closed();
    for (let i = 0; i < 35; i++) await run('expense.create', { cardId: id, description: 'Compra extensa ' + i, amount: 10 });
    await run('expense.create', { cardId: id, description: 'Compra novembro', amount: 7 }, '2026-11');
    await home(); await open();
    assert.equal(await dialog.locator('.card-purchase-row').count(), 36);
    const content = dialog.locator('.card-details-content');
    const header = await dialog.locator('header').boundingBox();
    assert.equal(await content.evaluate(el => el.scrollHeight > el.clientHeight), true);
    await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.deepEqual(await dialog.locator('header').boundingBox(), header);
    await page.screenshot({ path: join(tmpdir(), 'contas-card-details-desktop.png') });
    await page.keyboard.press('Escape'); await closed();
    await page.locator('#btn-next-month').click();
    await open();
    await dialog.getByText('Compra novembro', { exact: true }).waitFor();
    assert.equal(await dialog.locator('.card-purchase-row').count(), 2);
    assert.match(await dialog.innerText(), /2\/3/);
    await page.keyboard.press('Escape'); await closed();
    await page.locator('#btn-prev-month').click(); await open();
    assert.equal(await dialog.locator('.card-purchase-row').count(), 36);
    // Mobile keeps its own existing scroll lock; returning to desktop restores it.
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-testid="mobile-app"]').waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(await page.locator('[id^="btn-expand-card-"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#tab-accounts').waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.locator('#tab-accounts').click();
    await page.setViewportSize({ width: 768, height: 700 });
    await open();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 31 && bounds.y >= 31 && bounds.x + bounds.width <= 737 && bounds.y + bounds.height <= 669);
    await dialog.getByRole('button', { name: 'Adicionar compra' }).click();
    await page.locator('#card-purchase-modal-box').waitFor();
    assert.equal(await dialog.count(), 0);
    await page.locator('#card-purchase-modal-box').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const emptyName = 'Cartão vazio ' + Date.now();
    await run('card.create', { name: emptyName });
    await home();
    const emptyTile = page.locator('[id^="credit-card-"]').filter({ has: page.getByRole('heading', { name: emptyName, exact: true }) });
    await emptyTile.getByRole('button', { name: 'Ver detalhes' }).click();
    await dialog.getByText('Nenhuma compra lançada nesta fatura').waitFor();
    assert.equal(await dialog.locator('.card-purchase-row').count(), 0);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS: few/many purchases, simple/installment, repeated opens, X/ESC/backdrop, focus trap/return, unchanged card geometry, internal scroll, edit/delete/cancel, month selection, mobile resize and scroll cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
