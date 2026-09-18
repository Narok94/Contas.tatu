// Run against the local Vite server. Uses a fresh, isolated browser profile.
// node tests/browser-validation.cjs [playwright module path] [artifact directory]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[3] || path.join(require('node:os').tmpdir(), 'contas-tatu-history-review');
fs.mkdirSync(output, { recursive: true });
const key = 'organizacao_financeira_store_v1';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-17T15:00:00-03:00'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const report = { viewports: [], flows: [] };
  try {
    await page.goto('http://127.0.0.1:3000');
    await page.locator('#tab-dashboard').waitFor();
    const read = () => page.evaluate(key => localStorage.getItem(key), key);
    const editPayment = async name => {
      await page.getByLabel(`Opções de pagamento de ${name}`, { exact: true }).click();
      await page.getByRole('button', { name: 'Alterar valor ao pagar', exact: true }).click();
    };
    for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      let baseline;
      for (const tab of ['dashboard', 'accounts', 'history']) {
        await page.locator(`#tab-${tab}`).click();
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
          return { sidebar: rect('.app-sidebar'), header: rect('.app-toolbar'), month: rect('.app-month'), create: rect('#btn-header-new-account'), scrollHeight: document.documentElement.scrollHeight, height: innerHeight, overflowX: document.documentElement.scrollWidth > innerWidth };
        });
        if (!baseline) baseline = metrics;
        for (const element of ['sidebar', 'header', 'month', 'create']) assert.deepEqual(metrics[element], baseline[element], `shell moved at ${width}: ${tab}/${element}`);
        assert.equal(metrics.overflowX, false);
        if (tab === 'dashboard') assert.ok(metrics.scrollHeight <= height, `Dashboard scroll at ${width}: ${metrics.scrollHeight}`);
        await page.screenshot({ path: path.join(output, `${tab}-${width}x${height}.png`), fullPage: true });
        report.viewports.push({ width, height, tab, ...metrics });
      }
    }
    report.flows.push('Shared shell stable across all three pages and four viewports; Dashboard without vertical scroll');
    await page.setViewportSize({ width: 1440, height: 900 });
    // Exact scenario supplied by the user, resolved through the real UI.
    await page.locator('#tab-accounts').click();
    const payButtons = page.getByRole('button', { name: /^Marcar como pag[oa]$/ });
    while (await payButtons.count()) {
      await payButtons.first().click();
      assert.equal(await page.locator('#payment-value').count(), 0, 'normal payment opened a dialog');
    }
    const resolvedSeptember = JSON.parse(await read());
    await page.locator('#tab-history').click();
    await page.getByText('8 contas · 8 pagas · 0 pendentes', { exact: true }).waitFor();
    assert.match(await page.locator('.history-closing').innerText(), /Todas as contas de Setembro 2026 estão resolvidas/);
    assert.match(await page.locator('.history-panel').first().innerText(), /5\.110,00/);
    await page.screenshot({ path: path.join(output, 'eligible-prior-balances.png'), fullPage: true });
    await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
    await page.locator('#btn-confirm-action').click();
    const closedSeptember = JSON.parse(await read());
    const snap = closedSeptember.closedMonths['2026-09'];
    assert.equal(snap.summary.totalCount, 8);
    assert.equal(snap.summary.pendingCount, 0);
    assert.equal(Math.round(snap.summary.totalPaid * 100), 484490);
    assert.equal(Math.round(snap.summary.totalExpected * 100), 484490);
    assert.equal(snap.summary.totalPending, 0);
    assert.equal(snap.summary.previousPendingCardsTotal, 5110);
    assert.deepEqual(closedSeptember.cardMonthlyInvoices, resolvedSeptember.cardMonthlyInvoices);
    assert.deepEqual(closedSeptember.cardExpenses, resolvedSeptember.cardExpenses);
    await page.reload(); await page.locator('#tab-history').click();
    await page.getByText('Fechado', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'closed-prior-balances.png'), fullPage: true });
    await page.locator('#tab-accounts').click();
    await page.locator('#btn-expand-card-card_nubank').click();
    const oldInvoices = page.getByRole('button', { name: 'Pagar fatura', exact: true });
    assert.equal(await oldInvoices.count(), 7);
    await oldInvoices.first().click();
    assert.equal(await page.locator('#payment-value').count(), 0);
    const olderPaid = JSON.parse(await read());
    assert.deepEqual(olderPaid.closedMonths, closedSeptember.closedMonths);
    assert.equal(olderPaid.cardMonthlyInvoices.filter(i => i.month < '2026-09' && i.status === 'pago').length, 1);
    assert.equal(await oldInvoices.count(), 6, 'paid prior invoice stayed in operational pending list');
    report.flows.push('Exact September scenario: 8 paid, 4844.90 closed, 5110 prior debt separate, preserved, and payable at origin after closing');
    const fixture = { categories: [{ id: 'home', name: 'Casa', color: '#2563eb' }], simpleAccounts: [{ id: 'havan', name: 'Havan', value: 180, month: '2026-09', status: 'pendente', categoryId: 'home', createdAt: '' }], recurringDefinitions: [{ id: 'light', name: 'Luz', startMonth: '2026-09', isActive: true, createdAt: '' }], recurringMonthlyRecords: [], installmentPurchases: [{ id: 'sofa', description: 'Sofá', totalAmount: 300, installmentsCount: 3, startMonth: '2026-09', createdAt: '' }], creditCards: [{ id: 'card', name: 'Cartão', createdAt: '' }], cardExpenses: [{ id: 'purchase', cardId: 'card', description: 'Mercado', amount: 50, month: '2026-09', categoryId: 'home', createdAt: '' }], cardMonthlyInvoices: [] };
    await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture });
    await page.reload();
    await page.getByRole('button', { name: 'Marcar Havan como pago', exact: true }).click();
    assert.equal(await page.locator('#payment-value').count(), 0);
    let immediatelyPaid = JSON.parse(await read());
    assert.equal(immediatelyPaid.simpleAccounts[0].value, 180);
    assert.equal(immediatelyPaid.simpleAccounts[0].status, 'pago');
    await page.locator('#tab-accounts').click();
    await page.locator('#btn-toggle-havan').click();
    await page.locator('#btn-toggle-havan').dblclick();
    assert.equal(await page.locator('#payment-value').count(), 0);
    immediatelyPaid = JSON.parse(await read());
    assert.equal(immediatelyPaid.simpleAccounts[0].status, 'pago');
    assert.equal(immediatelyPaid.simpleAccounts[0].value, 180);
    assert.equal(immediatelyPaid.simpleAccounts.length, 1);
    await page.locator('#btn-toggle-havan').click();
    await page.locator('#tab-dashboard').click();
    const before = await read();
    await editPayment('Havan');
    await page.locator('#payment-value').fill('193,47');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await read(), before, 'cancel changed persistence');
    await editPayment('Havan');
    await page.locator('#payment-value').fill('1,001');
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
    assert.equal(await read(), before, 'invalid payment changed persistence');
    await page.locator('#payment-value').fill('193,47');
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).evaluate(button => { button.click(); button.click(); });
    let store = JSON.parse(await read());
    assert.equal(store.simpleAccounts[0].value, 193.47);
    assert.equal(store.simpleAccounts[0].status, 'pago');
    report.flows.push('Immediate normal payment on Dashboard and Accounts, double-click safe; optional Dashboard editing, cancel unchanged, corrected payment persisted');
    await page.locator('#tab-history').click();
    assert.equal(await page.getByRole('button', { name: 'Fechar mês', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Resolver em Contas', exact: true }).click();
    await page.locator('#btn-toggle-havan').click();
    store = JSON.parse(await read()); assert.equal(store.simpleAccounts[0].status, 'pendente'); assert.equal(store.simpleAccounts[0].value, 193.47);
    await page.locator('#btn-toggle-havan').click();
    assert.equal(await page.locator('#payment-value').count(), 0);
    assert.equal(JSON.parse(await read()).simpleAccounts[0].value, 193.47);
    for (const [id, amount] of [['light', '112,00'], ['sofa', '105,50'], ['card', null]]) {
      if (amount) {
        await editPayment(id === 'light' ? 'Luz' : 'Sofá');
        await page.locator('#payment-value').fill(amount);
        await page.screenshot({ path: path.join(output, `payment-${id}.png`) });
        await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
      } else {
        assert.equal(await page.getByLabel('Opções de pagamento de Cartão', { exact: true }).count(), 0);
        await page.locator(`#btn-toggle-${id}`).click();
        assert.equal(await page.locator('#payment-value').count(), 0);
      }
    }
    store = JSON.parse(await read());
    assert.equal(store.recurringMonthlyRecords[0].value, 112);
    assert.equal(store.installmentPurchases[0].paymentAmountsByMonth['2026-09'], 105.5);
    assert.equal(store.installmentPurchases[0].totalAmount, 300);
    report.flows.push('Accounts immediate payment and reversal; optional recurring and installment override; card paid directly without arbitrary editing');
    await page.locator('#tab-history').click();
    await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'close-confirmation.png') });
    const beforeClose = await read();
    await page.locator('#btn-confirm-cancel').click(); assert.equal(await read(), beforeClose);
    await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
    await page.locator('#btn-confirm-action').click();
    await page.getByText('Fechado', { exact: true }).waitFor();
    const closed = JSON.parse(await read());
    assert.equal(closed.closedMonths['2026-09'].summary.totalPaid, 460.97);
    await page.reload(); await page.locator('#tab-history').click();
    await page.getByText('Fechado', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'history-closed.png'), fullPage: true });
    await page.locator('#tab-accounts').click();
    const closedRaw = await read();
    await page.locator('#btn-toggle-havan').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await read(), closedRaw);
    await page.getByRole('button', { name: 'Fechar aviso' }).click();
    await page.locator('#btn-edit-havan').click();
    await page.getByRole('alert').waitFor(); assert.equal(await read(), closedRaw);
    await page.getByRole('button', { name: 'Fechar aviso' }).click();
    await page.locator('#btn-header-new-account').click();
    await page.getByRole('alert').waitFor(); assert.equal(await read(), closedRaw);
    await page.getByRole('button', { name: 'Fechar aviso' }).click();
    await page.locator('#btn-delete-havan').click();
    await page.locator('#btn-confirm-action').click();
    await page.getByRole('alert').waitFor(); assert.equal(await read(), closedRaw);
    report.flows.push('Close confirmation cancel unchanged; close and reload preserve snapshot; closed month blocks reversal and editing');
    await page.getByRole('button', { name: 'Fechar aviso' }).click();
    await page.locator('#btn-next-month').click();
    await editPayment('Luz');
    await page.locator('#payment-value').fill('150,00');
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
    const future = JSON.parse(await read());
    assert.deepEqual(future.closedMonths['2026-09'], closed.closedMonths['2026-09']);
    assert.equal(future.recurringMonthlyRecords.find(r => r.month === '2026-09').value, 112);
    report.flows.push('Future recurring payment leaves prior closed snapshot unchanged');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
