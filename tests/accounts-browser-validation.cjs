// Run alongside browser-validation.cjs against Vite with an isolated browser profile.
// node tests/accounts-browser-validation.cjs [playwright module path] [artifact directory]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[3] || path.join(require('node:os').tmpdir(), 'contas-tatu-accounts-review');
fs.mkdirSync(output, { recursive: true });
const key = 'organizacao_financeira_store_v1';
const sizes = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-21T12:00:00-03:00'));
  const errors = [], report = { viewports: [], flows: [] };
  page.on('pageerror', error => errors.push(error.message));
  const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const seed = async store => {
    await page.evaluate(({ key, store }) => localStorage.setItem(key, JSON.stringify(store)), { key, store });
    await page.reload(); await page.locator('#tab-accounts').click();
  };
  const count = async expected => {
    assert.equal(await page.locator('.accounts-result-count').innerText(), `${expected} ${expected === 1 ? 'conta' : 'contas'}`);
    assert.equal(await page.locator('.accounts-grid .account-tile').count(), expected);
  };
  const geometry = async () => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.account-tile')];
    const collisions = [];
    for (const card of cards) {
      const controls = [...card.querySelectorAll('.account-footer button, .account-footer summary')].filter(e => e.getBoundingClientRect().width > 0);
      for (let i = 0; i < controls.length; i++) {
        const a = controls[i].getBoundingClientRect();
        for (let j = i + 1; j < controls.length; j++) {
          const b = controls[j].getBoundingClientRect();
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) collisions.push(card.id);
        }
      }
    }
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      columns: getComputedStyle(document.querySelector('.accounts-grid')).gridTemplateColumns.split(' ').length,
      collisions,
      clipped: [...document.querySelectorAll('.account-name, .card-purchase-name, .card-invoice-total, .account-footer button, .accounts-filter-group button')]
        .filter(e => e.getBoundingClientRect().width > 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)).map(e => e.textContent),
      cards: cards.map(e => ({ id: e.id, height: e.getBoundingClientRect().height, width: e.getBoundingClientRect().width })) };
  });
  const checkGeometry = metrics => {
    assert.equal(metrics.overflow, false); assert.equal(metrics.columns, 3);
    assert.deepEqual(metrics.collisions, []); assert.deepEqual(metrics.clipped, []);
  };
  const partial = async amount => {
    await page.getByLabel('Opções de pagamento de Cartão', { exact: true }).click();
    await page.getByRole('button', { name: 'Registrar pagamento parcial', exact: true }).click();
    await page.locator('#payment-value').fill(amount);
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
    assert.equal(await page.locator('#payment-value').count(), 0);
  };
  try {
    await page.goto('http://127.0.0.1:3000'); await page.locator('#tab-accounts').click();
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height }); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#account-filters').isVisible(), false);
      assert.equal(await page.locator('#toggle-account-filters').getAttribute('aria-expanded'), 'false');
      await count(8);
      assert.equal(await page.locator('.accounts-heading > span').count(), 0);
      assert.equal(await page.locator('.accounts-summary small').count(), 0);
      assert.equal(await page.locator('.accounts-result-count').count(), 1);
      const metrics = await geometry(); checkGeometry(metrics);
      await page.screenshot({ path: path.join(output, `compact-${width}x${height}.png`), fullPage: true });
      await page.locator('#toggle-account-filters').click();
      assert.equal(await page.locator('#account-filters').isVisible(), true);
      assert.equal(await page.locator('#toggle-account-filters').getAttribute('aria-expanded'), 'true');
      await page.screenshot({ path: path.join(output, `filters-${width}x${height}.png`), fullPage: true });
      checkGeometry(await geometry());
      await page.locator('#toggle-account-filters').click();
      report.viewports.push({ width, height, ...metrics });
    }
    await page.locator('#toggle-account-filters').focus(); await page.keyboard.press('Enter');
    await page.locator('#filter-status-pending').click(); await count(5);
    await page.locator('#filter-status-paid').click(); await count(3);
    await page.locator('#filter-status-all').click();
    for (const [type, expected] of [['simple', 2], ['recurring', 4], ['installment', 1], ['card', 1]]) {
      await page.locator(`#filter-type-${type}`).click(); await count(expected);
    }
    await page.locator('#filter-status-pending').click(); await count(1);
    assert.match(await page.locator('#toggle-account-filters').innerText(), /Filtrar.*2/s);
    await page.locator('#toggle-account-filters').click(); await count(1);
    assert.equal(await page.locator('#account-filters').isVisible(), false);
    await page.locator('#toggle-account-filters').click();
    assert.equal(await page.locator('#filter-status-pending').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#filter-type-card').getAttribute('aria-pressed'), 'true');
    await page.locator('#filter-status-paid').click(); await count(0);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await count(8);
    assert.equal(await page.locator('.accounts-filter-indicator').count(), 0);
    await page.locator('#filter-type-card').click();
    await page.reload(); await page.locator('#tab-accounts').click(); await count(8);
    assert.equal(await page.locator('#account-filters').isVisible(), false);
    report.flows.push('Collapsed by default, keyboard toggle, every status/type, combined filters, active indicator, collapse preserves selection, clear, count 0/1/plural, reload resets transient selection');

    const fixture = { categories: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [],
      creditCards: [{ id: 'card', name: 'Cartão', createdAt: '' }], cardMonthlyInvoices: [],
      cardExpenses: [{ id: 'aug', cardId: 'card', description: 'Compras de agosto', month: '2026-08', amount: 1000, createdAt: '' },
        { id: 'sep', cardId: 'card', description: 'Compras de setembro', month: '2026-09', amount: 1900, createdAt: '' }] };
    await seed(fixture); await page.locator('#btn-prev-month').click();
    await partial('900,00');
    assert.equal((await read()).cardMonthlyInvoices[0].paidAmount, 900);
    assert.match(await page.locator('#credit-card-card').innerText(), /Parcial/);
    assert.match(await page.locator('.card-payment-summary').innerText(), /900,00.*100,00/s);
    await page.locator('#btn-next-month').click();
    assert.match(await page.locator('.card-invoice-total').innerText(), /2\.000,00/);
    assert.match(await page.locator('.card-previous-balance').innerText(), /Saldo anterior · Agosto.*100,00/s);
    const beforeCancel = await read();
    await page.getByLabel('Opções de pagamento de Cartão', { exact: true }).click();
    await page.getByRole('button', { name: 'Registrar pagamento parcial', exact: true }).click();
    await page.locator('#payment-value').fill('2000,01');
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
    assert.equal(await page.locator('#payment-value').count(), 1);
    assert.deepEqual(await read(), beforeCancel);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.deepEqual(await read(), beforeCancel);
    await partial('1500,00');
    assert.match(await page.locator('.card-payment-summary').innerText(), /1\.500,00.*500,00/s);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height }); checkGeometry(await geometry());
      await page.screenshot({ path: path.join(output, `september-partial-${width}x${height}.png`), fullPage: true });
    }
    const septemberRecords = (await read()).cardMonthlyInvoices;
    await page.locator('#tab-history').click();
    assert.equal(await page.getByRole('button', { name: 'Fechar mês', exact: true }).count(), 0);
    assert.match(await page.locator('.history-account').innerText(), /Parcial.*Pago:.*1\.500,00.*Restante:.*500,00/s);
    await page.getByRole('button', { name: 'Anual', exact: true }).click();
    assert.match(await page.locator('.history-year-total > strong').innerText(), /2\.400,00/);
    await page.locator('#tab-accounts').click();
    await page.locator('#toggle-account-filters').click(); await page.locator('#filter-status-pending').click(); await count(1);
    await page.locator('#filter-status-paid').click(); await count(0);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await page.locator('#toggle-account-filters').click();
    await page.locator('#btn-next-month').click();
    assert.equal(await page.locator('.card-previous-balance').count(), 1);
    assert.match(await page.locator('.card-previous-balance').innerText(), /Saldo anterior · Setembro.*500,00/s);
    assert.doesNotMatch(await page.locator('#credit-card-card').innerText(), /Agosto|100,00|pendências/);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height }); checkGeometry(await geometry());
      await page.screenshot({ path: path.join(output, `october-balance-${width}x${height}.png`), fullPage: true });
    }
    await page.locator('#btn-expand-card-card').click();
    assert.match(await page.locator('#credit-card-card').innerText(), /Nenhuma compra lançada/);
    assert.equal(await page.getByRole('button', { name: 'Pagar fatura', exact: true }).count(), 0);
    await page.locator('#btn-expand-card-card').click();
    await page.reload(); await page.locator('#tab-accounts').click(); await page.locator('#btn-next-month').click();
    assert.match(await page.locator('.card-previous-balance').innerText(), /Setembro.*500,00/s);
    await page.locator('#btn-toggle-card').click();
    assert.equal(await page.locator('#payment-value').count(), 0);
    let store = await read();
    assert.equal(store.cardMonthlyInvoices.find(i => i.month === '2026-10').paidAmount, 500);
    assert.equal(store.cardMonthlyInvoices.find(i => i.month === '2026-10').status, 'pago');
    assert.deepEqual(store.cardMonthlyInvoices.filter(i => i.month < '2026-10'), septemberRecords);
    await page.locator('#tab-history').click();
    await page.getByRole('button', { name: 'Fechar mês', exact: true }).click(); await page.locator('#btn-confirm-action').click();
    const snapshot = (await read()).closedMonths['2026-10'];
    assert.equal(snapshot.accounts[0].cardInfo.totalOpenAmount, 0);
    await page.getByRole('button', { name: 'Reabrir mês', exact: true }).click(); await page.locator('#btn-confirm-action').click();
    assert.deepEqual((await read()).closedMonthHistory['2026-10'], [snapshot]);
    await page.locator('#tab-accounts').click(); await page.locator('#btn-next-month').click();
    assert.equal(await page.locator('.card-previous-balance').count(), 0);
    assert.match(await page.locator('.card-invoice-total').innerText(), /0,00/);
    await page.locator('#tab-history').click(); await page.getByRole('button', { name: 'Anual', exact: true }).click();
    assert.match(await page.locator('.history-year-total > strong').innerText(), /2\.900,00/);
    report.flows.push('Real UI: August 1000/900/100, September 2000/1500/500, October only 500, history and annual paid totals, invalid/cancel no mutation, reload, full settlement, close/reopen with no resurrected debt');

    const stress = structuredClone(fixture);
    stress.cardExpenses = [{ ...fixture.cardExpenses[1], amount: 123456789.99 }];
    stress.creditCards[0].name = 'Cartão compartilhado para despesas familiares e compras de longo prazo';
    stress.simpleAccounts = [{ id: 'long', name: 'Manutenção preventiva completa do ar-condicionado e dos equipamentos da residência', value: 123456789.99, month: '2026-09', status: 'pago', createdAt: '' }];
    await seed(stress);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height }); checkGeometry(await geometry());
      await page.locator('#btn-expand-card-card').click(); checkGeometry(await geometry());
      assert.match(await page.locator('#card-items-card').innerText(), /Compras de setembro/);
      await page.screenshot({ path: path.join(output, `long-names-expanded-${width}x${height}.png`), fullPage: true });
      await page.locator('#btn-expand-card-card').click();
    }
    report.flows.push('Long names, large values, paid and pending actions, expanded purchases: no overlap, horizontal overflow or clipping at all four desktop sizes');

    // A legacy closure keeps its original paid invoice, without implying payment of old debt.
    const legacy = structuredClone(fixture);
    legacy.cardMonthlyInvoices = [{ id: 'legacy', cardId: 'card', month: '2026-09', status: 'pago' }];
    legacy.closedMonths = { '2026-09': { month: '2026-09', closedAt: '2026-09-20T12:00:00Z',
      accounts: [{ id: 'card', type: 'credit_card', name: 'Cartão', amount: 1900, status: 'pago',
        cardInfo: { cardId: 'card', invoiceStatus: 'pago', items: [], totalItemsCount: 0, currentMonthAmount: 1900,
          previousPendingAmount: 1000, previousPendingInvoices: [{ month: '2026-08', amount: 1000 }], totalOpenAmount: 1000 } }],
      summary: { month: '2026-09', totalExpected: 1900, totalPaid: 1900, totalPending: 0, previousPendingCardsTotal: 1000,
        totalOpenWithPreviousPending: 1000, pendingCount: 0, totalCount: 1, categoryBreakdown: [], activeEndingInstallments: [] } } };
    await seed(legacy);
    assert.match(await page.locator('.card-invoice-total').innerText(), /1\.900,00/);
    assert.match(await page.locator('#credit-card-card').innerText(), /Pago/);
    assert.equal(await page.locator('.card-previous-balance').count(), 0);
    assert.match(await page.locator('.accounts-pending small').innerText(), /1\.000,00.*no fechamento/);
    await page.locator('#tab-dashboard').click();
    assert.match(await page.locator('.metric-pending p').innerText(), /^\+.*1\.000,00/);
    await page.locator('#tab-accounts').click();
    await page.locator('#btn-next-month').click();
    assert.match(await page.locator('.card-previous-balance').innerText(), /Setembro.*1\.000,00/s);
    await page.locator('#btn-toggle-card').click();
    assert.deepEqual((await read()).closedMonths, legacy.closedMonths);
    await page.locator('#btn-next-month').click();
    assert.equal(await page.locator('.card-previous-balance').count(), 0);
    report.flows.push('Legacy closure retains official paid total and historical prior-debt hint; next month consolidates and pays that debt without changing the old snapshot');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'accounts-validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
