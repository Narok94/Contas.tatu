import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { getInstallmentStatusForMonth } from '../src/domain/installmentTimeline.js';
import { planOctober, purchases } from '../scripts/register-october-2026.js';
import { computeOperationalMonthlyAccounts } from '../src/domain/financeRules.js';
import { cardStatementRows, formatPurchaseDate } from '../src/utils/cardStatement.js';

test('October import preserves old SQL rows, dates, current installments and is idempotent; variable recurring stays editable',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(readFileSync('database/migrations/001_finance_v2.sql','utf8'));
  const db:Transport={batch:(qs,ro)=>pg.transaction(async tx=>{
    if(ro)await tx.exec('SET TRANSACTION READ ONLY');
    const rows=[];for(const q of qs)rows.push((await tx.query(q.text,q.values)).rows);return rows as any;
  })};
  await createFoundation({transaction:(qs,ro=false)=>db.batch(qs,ro)}).initialize();
  const repo=createRepository(db),finance=createFinanceService(repo);
  await finance.execute({action:'simple.create',month:'2026-09',expectedRevision:(await repo.load()).revision,data:{name:'Anterior',value:123.45,paid:true}});
  const before=await repo.load(),plan=await planOctober(before);
  assert.deepEqual(plan.counts,{simple:13,installments:25,recurring:3,cards:1,skipped:0});
  assert.equal(purchases.reduce((n,p)=>n+p.cents,0),272282);
  await repo.save(before,plan.next);
  const after=await repo.load();
  const originalState=JSON.stringify(after.store);
  const card=computeOperationalMonthlyAccounts('2026-10',after.store).find(a=>a.type==='credit_card')!;
  const statement=cardStatementRows(card,after.store);
  assert.equal(card.amount,2722.82);
  assert.equal(statement.length,38);
  assert.equal(statement.filter(row=>row.purchaseDate).length,21);
  assert.equal(statement.filter(row=>!row.purchaseDate).length,17);
  assert.deepEqual(statement.filter(row=>row.purchaseDate).map(row=>row.purchaseDate),[
    ...Array(6).fill('2026-10-22'),...Array(5).fill('2026-10-21'),...Array(4).fill('2026-10-20'),
    '2026-10-14','2026-10-13','2026-10-09','2026-10-09','2026-10-04','2026-10-01',
  ]);
  for(const expected of purchases) {
    const row=statement.find(({item})=>item.description===expected.name && Math.round(item.amount*100)===expected.cents
      && (expected.total ? item.installmentInfo?.current===expected.current && item.installmentInfo?.total===expected.total : !item.isInstallment));
    assert.ok(row,expected.name);
    assert.equal(row.purchaseDate,expected.day ? `2026-10-${String(expected.day).padStart(2,'0')}` : undefined,expected.name);
    assert.equal(formatPurchaseDate(row.purchaseDate),expected.day ? `${String(expected.day).padStart(2,'0')}/10/2026` : 'Data não informada');
  }
  assert.equal(JSON.stringify(after.store),originalState,'Statement projection cannot mutate any financial record');
  for(const [table,rows] of Object.entries(before.tables))for(const row of rows)
    assert.ok(after.tables[table].some(r=>JSON.stringify(r)===JSON.stringify(row)),table);
  const again=await planOctober(after);assert.deepEqual(again.next,after.store);
  assert.deepEqual(again.counts,{simple:0,installments:0,recurring:0,cards:0,skipped:38});
  for(const item of purchases.filter(p=>p.total)) {
    const p=after.store.installmentPurchases.find(p=>{const s=getInstallmentStatusForMonth(p,'2026-10');return s.description===item.name && s.currentInstallment===item.current && s.totalInstallments===item.total && Math.round(s.installmentAmount*100)===item.cents;})!;
    assert.ok(p);assert.equal(getInstallmentStatusForMonth(p,'2026-09').isActive,false);
    const november=getInstallmentStatusForMonth(p,'2026-11');
    assert.equal(november.isActive,item.current!<item.total!);
    if(november.isActive)assert.equal(november.currentInstallment,item.current!+1);
    if(item.day)assert.equal(new Date(p.createdAt).toISOString().slice(0,10),`2026-10-${String(item.day).padStart(2,'0')}`);
  }
  for(const item of purchases.filter(p=>!p.total)) {
    const p=after.store.cardExpenses.find(p=>p.description===item.name && Math.round(p.amount*100)===item.cents)!;
    assert.equal(p.cardId,after.store.creditCards[0].id);
    assert.equal(new Date(p.createdAt).toISOString().slice(0,10),`2026-10-${item.day}`);
  }
  const water=after.store.recurringDefinitions.find(d=>d.name==='Água')!;
  await finance.execute({action:'recurring.edit',month:'2026-10',expectedRevision:after.revision,data:{id:water.id,name:'Água',value:81.23}});
  await finance.execute({action:'payment',month:'2026-10',expectedRevision:(await repo.load()).revision,data:{id:water.id,type:'recurring',status:'pago'}});
  const november=(await finance.read('2026-11')).accounts.find(a=>a.id===water.id)!;
  assert.equal(november.amount,0);assert.equal(november.status,'pendente');assert.equal(november.recurringInfo?.isValueSet,false);assert.equal(november.cardInfo,undefined);
  assert.equal((await finance.read('2026-10')).accounts.find(a=>a.id===water.id)?.amount,81.23);
});
