import type { SevenExpense } from './model';
export const money = (cents:number) => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const escape = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function monthlyReport(month:string,expenses:SevenExpense[]) {
  const total=expenses.reduce((sum,e)=>sum+e.cents,0);
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprovante Seven — ${escape(month)}</title>
  <style>body{font:16px system-ui;color:#343a2b;max-width:960px;margin:auto;padding:24px;background:#faf9f5}article{border-top:1px solid #bfc7ad;padding:20px 0;break-inside:avoid}img{max-width:100%;max-height:600px;object-fit:contain}figure{display:inline-block;margin:8px;max-width:100%;vertical-align:top}p{overflow-wrap:anywhere}a{color:#354f26}@media print{button{display:none}body{background:white}img{max-height:400px}}</style>
  <h1>Comprovante Seven</h1><p>Henrique · Período: ${escape(month)}</p><h2>Total do período: ${money(total)}</h2><p>${expenses.length} despesa(s). Use Imprimir no navegador para salvar em PDF.</p>
  ${expenses.map(e=>`<article><h2>${escape(e.description)}</h2><p>Data: ${escape(e.date.split('-').reverse().join('/'))} · Cliente/local: ${escape(e.location)}</p><p><strong>${money(e.cents)}</strong></p>${e.notes ? `<p>${escape(e.notes)}</p>`:''}${e.accountId ? `<p>Conta vinculada: ${escape(e.accountId)}</p>`:''}<p>${e.images.length} comprovante(s)</p>${e.images.map(i=>`<figure><a href="${escape(i.data)}" download="${escape(i.name)}"><img src="${escape(i.data)}" alt="${escape(i.title || i.name)}"></a><figcaption>${i.title ? `<strong>${escape(i.title)}</strong><br>` : ''}${escape(i.name)}</figcaption></figure>`).join('')}</article>`).join('')}<h2>Total do período: ${money(total)}</h2></html>`;
}
