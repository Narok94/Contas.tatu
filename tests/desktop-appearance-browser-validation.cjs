// Read-only desktop visual regression checks against an isolated server and the October fixture.
// node tests/desktop-appearance-browser-validation.cjs [playwright module] [base URL] [fixture JSON]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

(async () => {
  const fixture = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  const original = JSON.stringify(fixture);
  const base = process.argv[3] || 'http://127.0.0.1:3100';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { Origin: base } });
    const marker = await context.request.get(base + '/api/auth/session');
    assert.equal(marker.headers()['x-contas-tatu-isolated'], 'true');
    const login = await context.request.post(base + '/api/auth/login', { data: {
      login: 'henrique', password: process.env.CONTAS_TATU_TEST_PASSWORD, remember: true,
    } });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    const errors = [];
    let writes = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET' && /\/api\/(finance|chat|backup|categories)/.test(request.url())) writes++; });
    await page.clock.setFixedTime(new Date('2026-10-30T12:00:00-03:00'));
    await page.route('**/api/finance?*', route => route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ ...fixture, month: new URL(route.request().url()).searchParams.get('month') }),
    }));
    await page.goto(base);
    await page.locator('.desk-metric').last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const background = () => page.locator('.app-shell').evaluate(el => getComputedStyle(el).backgroundImage);
    const expectedBackground = await background();
    assert.match(expectedBackground, /textura/);
    assert.match(expectedBackground, /linear-gradient/);
    const shot = name => page.screenshot({ path: join(tmpdir(), 'contas-calm-' + name + '.png'), fullPage: true, animations: 'disabled' });
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#tab-dashboard').click();
      await page.mouse.move(width - 20, height - 20);
      assert.deepEqual(await page.locator('.desk-metric h3').allTextContents(), ['Total do mês', 'Total pendente', 'Total pago']);
      assert.equal(await page.locator('.metric-total strong').innerText(), money(2722.82));
      assert.equal(await page.locator('.metric-pending strong').innerText(), money(2722.82));
      assert.equal(await page.locator('.metric-paid strong').innerText(), money(0));
      assert.equal(await page.locator('.desk-panel').count(), 2);
      assert.equal(await page.locator('.desk-hero,.desk-progress,.sidebar-note,.note-mascot,[role="progressbar"]').count(), 0);
      assert.equal(await page.locator('.desktop-dock > button').count(), 4);
      assert.equal(await page.locator('.app-sidebar,.sidebar-toggle').count(), 0);
      const metrics = await page.locator('.desk-metric').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { y: r.y, h: r.height, w: r.width }; }));
      assert.ok(metrics.every(card => card.h === 88 && card.w < 490), 'Summary cards keep their original height');
      assert.equal(await page.locator('.desk-metric-icon > svg').count(), 3);
      assert.equal(await page.locator('.metric-total .lucide-receipt-text').count(), 1);
      assert.equal(await page.locator('.metric-pending .lucide-clock-3').count(), 1);
      assert.equal(await page.locator('.metric-paid .lucide-circle-check').count(), 1);
      const texture = await page.locator('.app-shell').evaluate(el => { const c = getComputedStyle(el); return { size: c.backgroundSize, position: c.backgroundPosition, repeat: c.backgroundRepeat, attachment: c.backgroundAttachment }; });
      assert.ok(texture.size.split(', ').every(value => value === 'cover'));
      assert.ok(texture.position.split(', ').every(value => value === '50% 50%'));
      assert.ok(texture.repeat.split(', ').every(value => value === 'no-repeat'));
      assert.ok(texture.attachment.split(', ').every(value => value === 'fixed'));
      assert.ok(metrics.every(card => Math.abs(card.y - metrics[0].y) < 1));
      const greeting = await page.locator('.desk-greeting').boundingBox();
      assert.ok(greeting.y < 160);
      const open = await page.locator('.desk-open').boundingBox(), categories = await page.locator('.desk-categories').boundingBox();
      assert.ok(open.width > categories.width * 1.4 && Math.abs(open.y - categories.y) < 1);
      assert.ok(open.height < 400 && categories.height < 400);
      assert.equal(await page.locator('.desk-category-list li').count(), 1);
      assert.equal(await page.locator('.desk-category-list strong').innerText(), money(2722.82));
      await page.waitForFunction(() => getComputedStyle(document.getElementById('tab-dashboard')).backgroundColor === 'rgba(180, 225, 220, 0.4)');
      const active = await page.locator('#tab-dashboard').evaluate(el => { const c = getComputedStyle(el); return { background: c.backgroundColor, shadow: c.boxShadow }; });
      assert.equal(active.background, 'rgba(180, 225, 220, 0.4)'); assert.notEqual(active.shadow, 'none');
      const dock = page.locator('#desktop-navigation');
      const dockBounds = await dock.boundingBox();
      assert.ok(dockBounds.width < 260 && dockBounds.height <= 60);
      assert.equal(dockBounds.width, 210); assert.equal(dockBounds.height, 56);
      const glass = await dock.evaluate(el => { const c = getComputedStyle(el); return { background: c.backgroundColor, filter: c.backdropFilter }; });
      assert.equal(glass.background, 'rgba(255, 255, 255, 0.35)');
      assert.equal(glass.filter, 'blur(20px) saturate(1.5)');
      const availableWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
      assert.ok(Math.abs(dockBounds.x * 2 + dockBounds.width - availableWidth) < 2);
      assert.ok(height - dockBounds.y - dockBounds.height >= 16);
      assert.equal(await dock.evaluate(el => getComputedStyle(el).position), 'fixed');
      assert.equal(await page.locator('.app-shell').evaluate(el => getComputedStyle(el).paddingLeft), '0px');
      assert.equal(await page.locator('main').evaluate(el => el.getBoundingClientRect().x), 0);
      const accountControl = await page.locator('.toolbar-account').boundingBox(); assert.ok(accountControl.y < 100);
      for (const label of ['Início', 'Contas', 'Histórico', 'Configurações']) {
        const button = dock.getByRole('button', { name: label, exact: true });
        await button.hover();
        await button.getByRole('tooltip', { name: label, exact: true }).waitFor({ state: 'visible' });
        await page.mouse.move(width - 20, height - 20);
        assert.equal(await button.getByRole('tooltip').isVisible(), false);
      }
      await page.keyboard.press('Tab');
      await dock.getByRole('button', { name: 'Início', exact: true }).focus();
      assert.equal(await dock.getByRole('tooltip', { name: 'Início', exact: true }).isVisible(), true);
      assert.equal(await page.locator('#tab-dashboard').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#tab-accounts').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.locator('.accounts-grid').waitFor();
      await page.locator('#tab-dashboard').click();
      await page.mouse.move(width - 20, height - 20);
      await noOverflow(); await shot(width + '-home');
      await page.getByRole('button', { name: 'Ver todas', exact: false }).click();
      await page.locator('.accounts-grid').waitFor();
      assert.equal(await background(), expectedBackground);
      assert.equal(await page.locator('.accounts-total strong').innerText(), money(2722.82));
      await noOverflow(); await shot(width + '-accounts');
      await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
      await page.locator('.card-details-page').waitFor();
      assert.equal(await background(), expectedBackground);
      assert.equal(await page.locator('.card-statement-entry').count(), 38);
      assert.equal(await page.locator('dialog[open], [aria-modal="true"]').count(), 0);
      await noOverflow(); await shot(width + '-card');
      await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.deepEqual(await dock.boundingBox(), dockBounds, 'Dock stays fixed during document scroll');
      const lastRow = await page.evaluate(() => {
        const rows = document.querySelectorAll('.card-statement-entry');
        const rect = rows[rows.length - 1].getBoundingClientRect(); return { y: rect.y, height: rect.height };
      });
      assert.ok(lastRow.y + lastRow.height < dockBounds.y, 'Last table row remains above the dock');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Voltar para Contas' }).click();
      await page.locator('#tab-history').click(); await page.locator('.history-page').waitFor();
      assert.equal(await background(), expectedBackground);
      assert.equal(await page.locator('.history-totals strong').first().innerText(), money(2722.82));
      await noOverflow(); await shot(width + '-history');
      await page.locator('#btn-settings-header').click(); await page.locator('#settings-modal-box').waitFor();
      assert.equal(await background(), expectedBackground);
      assert.equal(await page.locator('#btn-settings-header').getAttribute('aria-current'), 'page');
      assert.equal(await dock.locator('[aria-current=page]').count(), 1);
      await noOverflow(); await shot(width + '-settings');
      await page.getByRole('button', { name: 'Fechar configurações' }).click();
      assert.equal(await page.locator('#tab-history').getAttribute('aria-current'), 'page');
    }
    // Unsupported browsers ignore the @supports glass block; verify the base surface stays readable.
    const fallback = await page.evaluate(() => {
      const stripGlassSupport = rules => {
        for (let index = rules.cssRules.length - 1; index >= 0; index--) {
          const rule = rules.cssRules[index];
          if (rule instanceof CSSSupportsRule && rule.conditionText.includes('backdrop-filter') && rule.cssText.includes('.desktop-dock')) rules.deleteRule(index);
          else if (rule.cssRules && typeof rule.deleteRule === 'function') stripGlassSupport(rule);
        }
      };
      for (const sheet of document.styleSheets) {
        if (!sheet.href || new URL(sheet.href).origin === location.origin) stripGlassSupport(sheet);
      }
      const surface = getComputedStyle(document.querySelector('.desktop-dock'));
      return { background: surface.backgroundColor, filter: surface.backdropFilter };
    });
    assert.equal(fallback.background, 'rgba(255, 255, 255, 0.88)');
    assert.equal(fallback.filter, 'none');
    // Test all three monetary indicators with paid and unpaid accounts, using display-only fixtures.
    const mixed = structuredClone(fixture);
    mixed.state.simpleAccounts.push({ id: 'paid-fixture', name: 'Conta paga', value: 250, month: '2026-10', status: 'pago', createdAt: '2026-10-01' });
    mixed.state.simpleAccounts.push({ id: 'pending-fixture', name: 'Conta pendente', value: 75, month: '2026-10', status: 'pendente', createdAt: '2026-10-02' });
    await page.unroute('**/api/finance?*');
    await page.route('**/api/finance?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mixed) }));
    await page.goto(base); await page.locator('.desk-metric').last().waitFor();
    assert.equal(await page.locator('.metric-total strong').innerText(), money(3047.82));
    assert.equal(await page.locator('.metric-pending strong').innerText(), money(2797.82));
    assert.equal(await page.locator('.metric-paid strong').innerText(), money(250));
    await page.unroute('**/api/finance?*');
    await page.route('**/api/finance?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.setViewportSize({ width: 393, height: 852 }); await page.goto(base);
    await page.locator('[data-testid="mobile-app"]').waitFor();
    await page.getByText('Buscando seus lançamentos…', { exact: true }).waitFor({ state: 'hidden' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.app-shell,.desktop-dashboard').count(), 0);
    await shot('mobile-after');
    assert.equal(await page.locator('.desktop-dock').count(), 0);
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
    await page.locator('.toolbar-account').waitFor();
    const logoutRequest = page.waitForRequest(request => request.url().endsWith('/api/auth/logout') && request.method() === 'POST');
    await page.locator('.toolbar-account').getByRole('button', { name: 'Sair', exact: true }).click();
    await logoutRequest;
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    assert.equal(JSON.stringify(fixture), original); assert.equal(writes, 0); assert.deepEqual(errors, []);
    console.log('PASS: shared fixed texture in all desktop views; 3 correct metrics with icons and unchanged 88px height; compact open accounts/category panels; unchanged glass dock, tooltips, keyboard navigation, bottom clearance and header logout; 1366/1440/1920 layouts; card remains a page; unchanged fixture and no financial/chat/backup writes; mobile screenshot captured.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
