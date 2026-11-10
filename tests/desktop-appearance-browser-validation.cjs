// Browser-only fixtures: every API request is intercepted; no database is accessed.
// node tests/desktop-appearance-browser-validation.cjs [playwright module] [base URL]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1673, height: 940 } });
  const errors = [], commands = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = { categories: [{ id: 'home', name: 'Casa', color: '#759e46' }], creditCards: [], simpleAccounts: [{ id: 'bill', name: 'Conta de teste', value: 300, month: '2026-11', status: 'pendente', categoryId: 'home', createdAt: '' }], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [{ id: 'purchase', description: 'Parcelamento de teste', totalAmount: 600, installmentsCount: 3, startMonth: '2026-09', createdAt: '' }], cardExpenses: [], cardMonthlyInvoices: [] };
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00-03:00'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/auth/session') body = { user: { id: 'test', name: 'Henrique', householdId: 'test' } };
    else if (url.pathname === '/api/chat') body = { messages: [], participants: [], nextBefore: null, historyStart: null };
    else if (url.pathname === '/api/finance') body = { revision: '1', month: url.searchParams.get('month'), state };
    else if (url.pathname === '/api/finance/commands') commands.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await page.goto(process.argv[3] || 'http://127.0.0.1:4173');
    await page.locator('.desk-metric').last().waitFor();
    assert.match(await page.locator('.metric-total strong').innerText(), /500,00/);
    assert.match(await page.locator('.desk-insights').innerText(), /1 parcelamento termina/);
    assert.match(await page.locator('.desk-insights').innerText(), /200,00 a menos/);
    for (const width of [1673, 1920, 1440, 1366, 1024, 768]) {
      await page.setViewportSize({ width, height: 940 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'overflow at ' + width);
      await page.screenshot({ path: path.join(os.tmpdir(), 'contas-redesign-' + width + '.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#tab-accounts').click(); await page.locator('.accounts-page').waitFor();
    await page.locator('#tab-history').click(); await page.locator('.history-page').waitFor();
    await page.locator('#tab-reports').click(); await page.locator('.desk-insights').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'desktop-reports');
    await page.locator('#btn-settings-header').click(); await page.locator('#settings-modal-box').waitFor();
    await page.getByRole('button', { name: 'Fechar configurações' }).click();
    await page.locator('#btn-header-new-account').click(); await page.locator('.tatu-dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.reload(); await page.locator('.desk-metric').last().waitFor();
    await page.locator('#btn-next-month').click();
    await page.waitForFunction(() => document.querySelector('.metric-total strong')?.textContent.includes('0,00'));
    await page.locator('#btn-prev-month').click();
    await page.getByRole('button', { name: 'Marcar Conta de teste como pago', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(commands[0].action, 'payment'); assert.equal(commands[0].data.id, 'bill');
    await page.setViewportSize({ width: 393, height: 852 }); await page.reload();
    await page.locator('[data-testid="mobile-app"]').waitFor();
    assert.equal(await page.locator('.app-sidebar,.desk-insights').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: six desktop widths, financial totals, insights, sidebar, reports focus, settings, creation modal, month navigation, payment dispatch, mobile isolation; no database access.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
