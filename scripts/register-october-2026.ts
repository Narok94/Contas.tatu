import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRepository, neonTransport, type Loaded, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { initialInstallmentVersion, getInstallmentStatusForMonth } from '../src/domain/installmentTimeline.js';
import { assertFinancialMutation, assertMonthOpen } from '../src/domain/monthOperations.js';
import type { FinanceDataStore } from '../src/domain/financeRules.js';
import type { InstallmentPurchase } from '../src/types/finance.js';
import { computeMonthlyAccounts } from '../src/domain/financeRules.js';

const month='2026-10';
import { purchases } from '../src/data/october2026CardPurchases.js';
export { purchases };
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export async function planOctober(before:Loaded) {
  let next:FinanceDataStore=structuredClone(before.store);
  assertMonthOpen(next,month);
  const counts={simple:0,installments:0,recurring:0,cards:0,skipped:0};
  const repository={load:async()=>({...before,store:next}),save:async(_:Loaded,state:typeof next)=>{next=state;return before.revision;}};
  const service=createFinanceService(repository);
  const command=async(action:string,data:Record<string,unknown>)=>service.execute({action,month,expectedRevision:before.revision,data});
  let card=next.creditCards.find(c=>normalize(c.name)==='cartao');
  if(!card) {
    assert.equal(next.creditCards.length,0,'Ambiguous card: review before inserting');
    await command('card.create',{name:'Cartão'});card=next.creditCards.at(-1)!;counts.cards++;
  }
  const cardCategory=next.categories.find(c=>normalize(c.name)==='cartao')?.id;
  for(const item of purchases) {
    assert.ok(Number.isSafeInteger(item.cents) && item.cents>0);
    const date=item.day ? `${month}-${String(item.day).padStart(2,'0')}` : undefined;
    const stamp=date ? `${date}T12:00:00-03:00` : new Date().toISOString();
    if(item.total) {
      assert.ok(item.current!>=1 && item.current!<=item.total);
      const matches:InstallmentPurchase[]=next.installmentPurchases.filter(p=>{
        const st=getInstallmentStatusForMonth(p,month);
        return st.isActive && normalize(st.description)===normalize(item.name) && Math.round(st.installmentAmount*100)===item.cents && st.currentInstallment===item.current && st.totalInstallments===item.total;
      });
      assert.ok(matches.length<=1,'Duplicate installment candidates');
      if(matches.length) {assert.equal(getInstallmentStatusForMonth(matches[0],month).creditCardId,card.id,'Existing matching purchase is not linked to this card');counts.skipped++;continue;}
      // Initial version supports an imported current/total position without backdating charges.
      const p={id:randomUUID(),description:item.name,totalAmount:item.cents*item.total/100,installmentsCount:item.total,
        startMonth:month,effectiveFromMonth:month,baseInstallmentNumber:item.current!,creditCardId:card.id,categoryId:cardCategory,
        notes:date ? `Data do lançamento: ${date}` : 'Lançamento de outubro/2026; dia não informado.',createdAt:stamp};
      next.installmentPurchases.push({...p,versions:[{...initialInstallmentVersion(p),recordedAt:new Date().toISOString(),reason:`Cadastro outubro/2026: parcela ${item.current}/${item.total}${date ? `; lançamento ${date}` : '; dia não informado'}`} ]});
      counts.installments++;
    } else {
      const matches=next.cardExpenses.filter(e=>normalize(e.description)===normalize(item.name) && e.month===month && Math.round(e.amount*100)===item.cents);
      assert.ok(matches.length<=1,'Duplicate expense candidates');
      if(matches.length) {assert.equal(matches[0].cardId,card.id);assert.equal(new Date(matches[0].createdAt).toISOString().slice(0,10),date);counts.skipped++;continue;}
      await command('expense.create',{cardId:card.id,description:item.name,amount:item.cents/100,categoryId:cardCategory});
      next.cardExpenses.at(-1)!.createdAt=stamp;counts.simple++;
    }
  }
  for(const name of ['Água','Luz','Internet']) {
    const matches=next.recurringDefinitions.filter(d=>normalize(d.name)===normalize(name));
    assert.ok(matches.length<=1,'Duplicate recurring definitions');
    if(matches.length) {assert.ok(matches[0].isActive && matches[0].startMonth<=month);continue;}
    await command('recurring.create',{name,initialValue:0});counts.recurring++;
  }
  assertFinancialMutation(before.store,next);
  for(const [key,oldRows] of Object.entries(before.store)) {
    if(Array.isArray(oldRows)) for(const row of oldRows) assert.deepEqual((next as any)[key].find((r:any)=>r.id===row.id),row,`Existing ${key} changed`);
    else assert.deepEqual((next as any)[key],oldRows);
  }
  for(const item of purchases.filter(p=>p.total)) {
    const matches:InstallmentPurchase[]=next.installmentPurchases.filter(p=>{
      const st=getInstallmentStatusForMonth(p,month);
      return st.isActive && st.description===item.name && st.currentInstallment===item.current && st.totalInstallments===item.total && Math.round(st.installmentAmount*100)===item.cents && st.creditCardId===card.id;
    });assert.equal(matches.length,1);
    assert.equal(getInstallmentStatusForMonth(matches[0],'2026-09').isActive,false);
  }
  for(const m of [month,'2026-11','2027-01']) for(const name of ['Água','Luz','Internet']) {
    const a=computeMonthlyAccounts(m,next).find(a=>a.name===name && a.type==='recurring')!;
    assert.ok(a);assert.equal(a.amount,0);assert.equal(a.status,'pendente');assert.equal(a.recurringInfo?.isValueSet,false);assert.equal(a.cardInfo,undefined);
  }
  return {next,counts};
}

async function main() {
  const repo=createRepository();const before=await repo.load();
  const {next,counts}=await planOctober(before);
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',counts,octoberCents:purchases.reduce((s,p)=>s+p.cents,0)}));
  if(!process.argv.includes('--apply'))return;
  // Reject any SQL that could modify an existing financial row, even sort_order.
  const insertOnly:Transport={batch:async(qs,ro)=>{
    if(!ro) for(const query of qs) assert.ok(query.text.startsWith('SELECT ') || query.text.startsWith('INSERT INTO ') || query.text.startsWith('UPDATE finance_v2.households SET revision=revision+1,'),'Unexpected existing-row mutation');
    return neonTransport.batch(qs,ro);
  }};
  await createRepository(insertOnly).save(before,next);
  const after=await repo.load();
  for(const [table,rows] of Object.entries(before.tables)) for(const row of rows) {
    assert.ok(after.tables[table].some(r=>JSON.stringify(r)===JSON.stringify(row)),`Existing raw row changed in ${table}`);
  }
  const repeated=await planOctober(after);
  assert.deepEqual(repeated.next,after.store);assert.equal(repeated.counts.skipped,38);
  console.log(JSON.stringify({verified:true,counts,revision:after.revision,repeatCreates:repeated.counts.simple+repeated.counts.installments+repeated.counts.recurring+repeated.counts.cards}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('October registration failed; inspect validation without exposing credentials.');process.exitCode=1;});
