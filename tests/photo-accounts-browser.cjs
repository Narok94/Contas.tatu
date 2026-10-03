// Focused mobile OCR integration. Financial/auth routes are mocked; no real data is written.
const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

(async () => {
  const app = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '3113'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      app.stdout.on('data', data => { if (data.toString().includes('3113')) resolve(); });
      app.stderr.resume(); app.on('exit', () => reject(new Error('Preview stopped')));
      setTimeout(() => reject(new Error('Preview timeout')), 20000).unref();
    });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const out = path.join(process.env.TEMP, 'contas-tatu-photo'); mkdirSync(out, { recursive: true });
    for (const [width, height] of [[393, 852], [414, 896]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
      context.setDefaultTimeout(120000);
      const writes = [], errors = [];
      await context.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === 'POST') writes.push(request.postDataJSON());
        const state = { categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] };
        const body = url.pathname === '/api/auth/session' ? { user: { id: 'visual', name: 'Henrique', householdId: 'visual' } }
          : url.pathname === '/api/chat' ? { messages: [], participants: [], nextBefore: null }
          : { revision: '1', month: url.searchParams.get('month'), state };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3113'); await page.getByRole('button', { name: 'Foto', exact: true }).click();
      await page.getByRole('button', { name: 'Tirar foto', exact: true }).waitFor();
      assert.equal(await page.locator('input[type=file][capture=environment]').count(), 1);
      const fixture = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 320;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1500, 320);
        ctx.fillStyle = 'black'; ctx.font = '48px Arial';
        ctx.fillText('Casas Bahia | 3/3 | R$ 500', 50, 100); ctx.fillText('Loja 100 | 1/8 | R$ 345', 50, 220);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'contas.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
      await page.getByRole('heading', { name: 'Confira as contas', exact: true }).waitFor();
      const forms = page.locator('.photo-review'); assert.equal(await forms.count(), 2);
      assert.equal(await forms.nth(0).getByLabel('Nome', { exact: true }).inputValue(), 'Casas Bahia');
      assert.equal(await forms.nth(1).getByLabel('Nome', { exact: true }).inputValue(), 'Loja 100');
      assert.equal(await forms.nth(0).getByLabel('Parcela atual', { exact: true }).inputValue(), '3');
      assert.equal(await forms.nth(1).getByLabel('Total de parcelas', { exact: true }).inputValue(), '8');
      assert.equal(await forms.nth(0).getByLabel('Valor da conta/parcela (R$)', { exact: true }).inputValue(), '500');
      assert.equal(writes.length, 0, 'OCR must never save automatically');
      await page.getByLabel('Mês da conta/parcela', { exact: true }).fill('2026-10');
      await forms.nth(1).getByLabel('Nome', { exact: true }).fill('Loja 100 revisada');
      await forms.nth(1).getByLabel('Valor da conta/parcela (R$)', { exact: true }).fill('350');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `review-${width}.png`) });
      await forms.nth(0).getByRole('button', { name: 'Confirmar e adicionar', exact: true }).click();
      await forms.nth(0).getByText('Conta adicionada', { exact: true }).waitFor();
      assert.equal(writes.length, 1); assert.equal(writes[0].action, 'installment.create');
      assert.equal(writes[0].month, '2026-08'); assert.equal(writes[0].data.totalAmount, 1500);
      await forms.nth(1).getByRole('button', { name: 'Confirmar e adicionar', exact: true }).click();
      await forms.nth(1).getByText('Conta adicionada', { exact: true }).waitFor();
      assert.equal(writes.length, 2); assert.equal(writes[1].data.description, 'Loja 100 revisada');
      assert.equal(writes[1].data.totalAmount, 2800);
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await page.getByRole('button', { name: 'Foto', exact: true }).click();
      // Clear failure path and manual fallback, without a financial write.
      await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
      await page.getByRole('alert').filter({ hasText: 'Não consegui ler a foto' }).waitFor();
      await page.getByRole('button', { name: 'Preencher outra conta manualmente', exact: true }).click();
      assert.equal(await page.locator('.photo-review').count(), 1); assert.equal(writes.length, 2);
      await page.getByRole('button', { name: 'Fechar', exact: true }).click(); assert.equal(writes.length, 2);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: real OCR, editable preview, installment mapping, explicit confirmation, no auto-write, failure/manual fallback.`);
      await context.close();
    }
  } finally { if (browser) await browser.close(); app.kill(); app.stdout.destroy(); app.stderr.destroy(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
