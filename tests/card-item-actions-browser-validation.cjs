// API interception only: these checks never read or mutate a database.
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const commands = [], errors = [];
    let rejectDelete = false;
    const state = { categories: [], creditCards: [{ id: 'card', name: 'Cartão teste', createdAt: '' }], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], cardMonthlyInvoices: [],
      cardExpenses: [{ id: 'expense', cardId: 'card', description: 'Compra teste', amount: 90, month: '2026-11', createdAt: '' }],
      installmentPurchases: [{ id: 'plan', creditCardId: 'card', description: 'Parcelada teste', totalAmount: 300, installmentsCount: 3, startMonth: '2026-11', createdAt: '' }] };
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00-03:00'));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let body = {}, status = 200;
      if (url.pathname === '/api/auth/session') body = { user: { id: 'test', name: 'Teste', householdId: 'test' } };
      if (url.pathname === '/api/finance') body = { revision: '1', month: url.searchParams.get('month'), state };
      if (url.pathname === '/api/finance/commands') {
        const command = route.request().postDataJSON(); commands.push(command);
        if (command.action === 'expense.edit') Object.assign(state.cardExpenses[0], command.data);
        if (command.action === 'expense.archive') { if (rejectDelete) status = 422; else state.cardExpenses = []; }
        if (command.action === 'installment.cancel') state.installmentPurchases = [];
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.argv[3] || 'http://127.0.0.1:4173');
    await page.locator('#tab-accounts').click(); await page.locator('#btn-expand-card-card').click();
    await page.getByRole('button', { name: 'Editar Compra teste', exact: true }).click();
    await page.locator('#card-purchase-modal-box input[type="text"]').fill('Compra editada');
    await page.locator('#btn-save-card-purchase').click();
    await page.getByRole('button', { name: 'Editar Compra editada', exact: true }).waitFor();
    assert.equal(commands[0].action, 'expense.edit'); assert.equal(commands[0].data.id, 'expense');
    await page.getByRole('button', { name: 'Editar Parcelada teste', exact: true }).click();
    assert.equal(await page.locator('#card-purchase-modal-box input[type="text"]').inputValue(), 'Parcelada teste');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Excluir Compra editada', exact: true }).click();
    await page.locator('#btn-confirm-cancel').click(); assert.equal(commands.length, 1);
    rejectDelete = true;
    await page.getByRole('button', { name: 'Excluir Compra editada', exact: true }).click(); await page.locator('#btn-confirm-action').click();
    await page.locator('.operation-error').waitFor(); assert.equal(await page.locator('#confirm-modal-box').isVisible(), true);
    rejectDelete = false; await page.locator('#btn-confirm-action').click();
    await page.getByRole('button', { name: 'Excluir Compra editada', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Excluir Parcelada teste', exact: true }).click();
    assert.match(await page.locator('#confirm-modal-box').innerText(), /preservando os meses anteriores/);
    await page.locator('#btn-confirm-action').click();
    await page.getByText('Nenhuma compra lançada nesta fatura', { exact: true }).waitFor();
    assert.equal(commands.at(-1).action, 'installment.cancel'); assert.equal(commands.at(-1).data.id, 'plan');
    await page.setViewportSize({ width: 768, height: 700 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: edit and delete in card details, installment editor, cancellation scope, cancel confirmation, failed deletion retained, refreshed statement, no horizontal overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
