import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FinanceDataStore, computeMonthlyAccounts, computeFinancialSummary, applyInstallmentUpdate,
  getPreviousPendingCardInvoices } from '../src/domain/financeRules';
import { getInstallmentStatusForMonth as resolve, resolveInstallmentVersion, calculateInstallmentValue } from '../src/domain/installmentTimeline';
import { changeInstallmentFromMonth as change, correctInstallmentMonth as correct,
  cancelInstallmentFromMonth as cancel, payoffInstallment as payoff, installmentPayoffQuote } from '../src/domain/installmentOperations';
import { closeMonth, reopenMonth, recordPayment, assertFinancialMutation } from '../src/domain/monthOperations';
import { computeAnnualHistory, computeActiveInstallments } from '../src/domain/history';

function fixture(card?: string): FinanceDataStore {
  return { categories: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [],
    creditCards: ['A','B'].map(id => ({ id, name: id, createdAt: '' })), cardExpenses: [], cardMonthlyInvoices: [],
    installmentPurchases: [{ id: 'p', description: 'Compra', totalAmount: 1200, installmentsCount: 12,
      startMonth: '2026-01', createdAt: '', creditCardId: card }] };
}
const purchase = (s: FinanceDataStore) => s.installmentPurchases[0];
const data = (creditCardId?: string, currentInstallment = 10) => ({ description: 'Nova configuração',
  totalAmount: 2400, installmentsCount: 12, currentInstallment, creditCardId });
const ownAmount = (s: FinanceDataStore, m: string, card: string) =>
  computeMonthlyAccounts(m, s).find(a => a.id === card)!.cardInfo!.currentMonthAmount;

test('cancelamento em julho preserva janeiro-junho e encerra somente o futuro', () => {
  const s=fixture(), before=structuredClone(s);
  const next=cancel(s,'p','2026-07','Cancelamento das futuras');
  for(let i=1;i<=6;i++) assert.deepEqual(resolve(purchase(next),`2026-0${i}`),resolve(purchase(s),`2026-0${i}`));
  assert.equal(resolve(purchase(next),'2026-07').isActive,false);
  assert.equal(resolve(purchase(next),'2026-08').operation,'cancel');
  assert.equal(computeMonthlyAccounts('2026-08',next).some(a=>a.type==='installment'),false);
  assert.equal(purchase(next).versions!.length,2);
  assert.deepEqual(s,before);
});

test('quitação avulsa em julho registra 400, preserva seis pagamentos e elimina agosto', () => {
  let s=fixture(); s.creditCards=[];
  Object.assign(purchase(s),{totalAmount:1000,installmentsCount:10});
  for(let i=1;i<=6;i++) s=recordPayment(s,`2026-0${i}`,'p','installment','pago');
  const before=structuredClone(s);
  assert.equal(installmentPayoffQuote(s,'p','2026-07'),400);
  s=payoff(s,'p','2026-07',400,'Quitação das quatro parcelas');
  assert.equal(computeFinancialSummary('2026-07',s).totalPaid,400);
  assert.equal(computeMonthlyAccounts('2026-08',s).length,0);
  assert.equal(computeAnnualHistory(2026,s).total,1000);
  for(let i=1;i<=6;i++) assert.deepEqual(computeMonthlyAccounts(`2026-0${i}`,s),computeMonthlyAccounts(`2026-0${i}`,before));
  assert.equal(purchase(s).versions!.at(-1)!.payoffAmount,400);
  assert.deepEqual(purchase(s).statusByMonth,purchase(before).statusByMonth);
});

test('quitação no cartão é paga na fatura uma vez, sem somar item novamente no anual', () => {
  let s=fixture('A');
  Object.assign(purchase(s),{totalAmount:1000,installmentsCount:10});
  for(let i=1;i<=6;i++) s=recordPayment(s,`2026-0${i}`,'A','credit_card','pago');
  s.cardExpenses.push({id:'other',cardId:'A',description:'Outra',amount:50,month:'2026-07',createdAt:''});
  s=payoff(s,'p','2026-07',400,'Quitação confirmada');
  assert.equal(ownAmount(s,'2026-07','A'),450);
  assert.equal(computeFinancialSummary('2026-07',s).totalPaid,400);
  assert.equal(computeAnnualHistory(2026,s).total,1000);
  assert.equal(ownAmount(s,'2026-08','A'),0);
  assert.deepEqual(getPreviousPendingCardInvoices('A','2026-08',s),[{month:'2026-07',amount:50}]);
  assert.throws(()=>recordPayment(s,'2026-07','A','credit_card','pendente'),/quitação/);
});

for(const [from,to] of [['A','B'],[undefined,'A'],['A','']] as const) {
  test(`vínculo temporal ${from ?? 'avulso'} → ${to || 'avulso'} preserva setembro`,()=>{
    const s=fixture(from), before=computeMonthlyAccounts('2026-09',s);
    const next=change(s,'p','2026-10',data(to),'Mudança em outubro');
    assert.deepEqual(computeMonthlyAccounts('2026-09',next),before);
    assert.equal(resolve(purchase(next),'2026-09').creditCardId,from);
    assert.equal(resolve(purchase(next),'2026-10').creditCardId,to || undefined);
    if(to) assert.equal(ownAmount(next,'2026-10',to),200);
    else assert.equal(computeMonthlyAccounts('2026-10',next).find(a=>a.type==='installment')!.amount,200);
  });
}

test('correção retroativa exige reabertura, preserva V1 e não altera meses adjacentes',()=>{
  let s=fixture(); s.creditCards=[];
  s=recordPayment(s,'2026-09','p','installment','pago');
  s=closeMonth(s,'2026-09');
  const v1=structuredClone(s.closedMonths!['2026-09']);
  assert.throws(()=>correct(s,'p','2026-09',data(undefined,9),'Erro em setembro'),/fechado/);
  s=reopenMonth(s,'2026-09');
  const august=resolve(purchase(s),'2026-08'),october=resolve(purchase(s),'2026-10');
  s=correct(s,'p','2026-09',data(undefined,9),'Erro em setembro');
  assert.equal(resolve(purchase(s),'2026-09').installmentAmount,200);
  assert.deepEqual(resolve(purchase(s),'2026-08'),august);
  assert.deepEqual(resolve(purchase(s),'2026-10'),october);
  // Existing paid override is not silently rewritten by a configuration correction.
  assert.equal(computeFinancialSummary('2026-09',s).totalPaid,100);
  s=recordPayment(s,'2026-09','p','installment','pendente');
  s=recordPayment(s,'2026-09','p','installment','pago',200);
  s=closeMonth(s,'2026-09');
  assert.equal(s.closedMonths!['2026-09'].summary.totalPaid,200);
  assert.deepEqual(s.closedMonthHistory!['2026-09'],[v1]);
});

test('130 parcelas continuam calculáveis após edição sem capturar 120 snapshots',()=>{
  const s=fixture('A');
  Object.assign(purchase(s),{startMonth:'2010-01',totalAmount:130,installmentsCount:130});
  const before=resolve(purchase(s),'2020-05');
  s.installmentPurchases=applyInstallmentUpdate(s.installmentPurchases,'p','2020-10',
    {description:'Alterada',totalAmount:260,installmentsCount:130,currentInstallment:130,creditCardId:'B'});
  assert.deepEqual(resolve(purchase(s),'2020-05'),before);
  assert.equal(resolve(purchase(s),'2020-05').isActive,true);
  assert.equal(purchase(s).monthlySnapshots,undefined);
  assert.equal(purchase(s).versions!.length,2);
  assert.equal(ownAmount(s,'2020-10','B'),2);
  assert.deepEqual(getPreviousPendingCardInvoices('A','2020-11',s),[{month:'2020-10',amount:129}]);
});

test('regra legada uniforme é explícita: 100/3 soma 99,99; nenhum resíduo foi redistribuído',()=>{
  const p={...purchase(fixture()),totalAmount:100,installmentsCount:3};
  assert.equal(calculateInstallmentValue(100,3),33.33);
  const cents=['2026-01','2026-02','2026-03'].map(m=>Math.round(resolve(p,m).installmentAmount*100));
  assert.deepEqual(cents,[3333,3333,3333]);
  assert.equal(cents.reduce((a,b)=>a+b),9999);
  assert.equal(resolveInstallmentVersion(p,'2026-01').roundingRule,'legacy_uniform');
});

test('resolvedor encontra versão histórica e futura entre várias fronteiras',()=>{
  let s=fixture('A');
  s=change(s,'p','2026-07',data('B',7),'Julho');
  s=change(s,'p','2026-10',{...data('',10),totalAmount:3600},'Outubro');
  assert.equal(resolveInstallmentVersion(purchase(s),'2026-03').totalAmount,1200);
  assert.equal(resolveInstallmentVersion(purchase(s),'2026-08').creditCardId,'B');
  assert.equal(resolveInstallmentVersion(purchase(s),'2026-11').totalAmount,3600);
  assert.equal(resolve(purchase(s),'2026-11').currentInstallment,11);
  assert.equal(resolve(purchase(s),'2027-01').isActive,false);
  assert.equal(computeActiveInstallments('2026-08',s)[0].amount,200);
});

test('correções repetidas guardam todas as versões e a última vale só naquele mês',()=>{
  let s=fixture();
  s=correct(s,'p','2026-09',data(undefined,9),'Correção 1');
  const old=structuredClone(purchase(s).versions);
  s=correct(s,'p','2026-09',{...data(undefined,9),totalAmount:3600},'Correção 2');
  assert.deepEqual(purchase(s).versions!.slice(0,2),old);
  assert.equal(resolve(purchase(s),'2026-09').installmentAmount,300);
  assert.equal(resolve(purchase(s),'2026-10').installmentAmount,100);
});

test('snapshot legado não muda e correção explícita tem precedência somente no mês alvo',()=>{
  const s=fixture('A');
  purchase(s).monthlySnapshots={'2026-03':{currentInstallment:3,totalInstallments:12,remainingInstallments:9,
    installmentAmount:75,endMonth:'2026-12'}};
  const before=structuredClone(purchase(s).monthlySnapshots);
  const next=change(s,'p','2026-10',data('B'),'Troca futura');
  assert.equal(resolve(purchase(next),'2026-03').installmentAmount,75);
  assert.equal(resolve(purchase(next),'2026-03').creditCardId,'A');
  const fixed=correct(next,'p','2026-03',{...data('A',3),totalAmount:1200},'Correção do legado');
  assert.equal(resolve(purchase(fixed),'2026-03').installmentAmount,100);
  assert.deepEqual(purchase(fixed).monthlySnapshots,before);
  assert.equal(resolve(purchase(fixed),'2026-10').creditCardId,'B');
});

test('categoria ausente histórica não recebe categoria nova por fallback',()=>{
  const s=fixture(); s.categories=[{id:'new',name:'Nova',color:''}];
  const next=change(s,'p','2026-10',{...data(),categoryId:'new'},'Categoria nova');
  assert.equal(resolve(purchase(next),'2026-09').categoryId,undefined);
  assert.equal(computeMonthlyAccounts('2026-09',next).find(a=>a.type==='installment')!.categoryId,undefined);
  assert.equal(resolve(purchase(next),'2026-10').categoryId,'new');
});

test('mudança não pode encobrir fronteiras futuras, snapshots ou encerramento',()=>{
  const s=change(fixture(),'p','2026-10',data(),'Outubro');
  assert.throws(()=>change(s,'p','2026-09',data(undefined,9),'Retroativa disfarçada'),/posteriores/);
  const ended=cancel(fixture(),'p','2026-07','Encerramento');
  assert.throws(()=>change(ended,'p','2026-08',data(undefined,8),'Reativação'),/ativo/);
  assert.throws(()=>cancel(ended,'p','2026-07','Repetição'),/ativo/);
});

test('pagamentos futuros não podem desaparecer em cancelamento ou troca de dono',()=>{
  let s=fixture(); s=recordPayment(s,'2026-10','p','installment','pago');
  const before=structuredClone(s);
  assert.throws(()=>cancel(s,'p','2026-07','Cancelar'),/pagamentos/);
  assert.throws(()=>change(s,'p','2026-10',data('A'),'Transferir'),/pagamentos/);
  assert.deepEqual(s,before);
});

test('quitação rejeita valor divergente, invoice já paga e reversão comum do evento',()=>{
  const s=fixture();
  assert.throws(()=>payoff(s,'p','2026-07',599,'Quitação'),/corresponder/);
  const paid=payoff(s,'p','2026-07',600,'Quitação');
  assert.throws(()=>recordPayment(paid,'2026-07','p','installment','pendente'),/auditável/);
  assert.throws(()=>payoff(paid,'p','2026-07',600,'Retry'),/disponível/);
  const card=recordPayment(fixture('A'),'2026-07','A','credit_card','pago');
  assert.throws(()=>payoff(card,'p','2026-07',600,'Quitação'),/pagamentos/);
});

test('imutabilidade é verificada para versões e mudanças que alcançam mês fechado',()=>{
  const s=change(fixture(),'p','2026-10',data(),'Outubro');
  const corrupt=structuredClone(s); purchase(corrupt).versions![0].totalAmount=1;
  assert.throws(()=>assertFinancialMutation(s,corrupt),/imutáveis/);
  let closed=fixture(); closed.creditCards=[];
  closed=closeMonth(recordPayment(closed,'2026-10','p','installment','pago'),'2026-10');
  assert.throws(()=>change(closed,'p','2026-09',data(undefined,9),'Afeta outubro'),/fechado/);
});

test('leitura de legado é pura, preserva campos ausentes e ausência de eventos',()=>{
  const s=fixture(), before=JSON.stringify(s);
  computeMonthlyAccounts('2026-10',s); computeAnnualHistory(2026,s);
  resolveInstallmentVersion(purchase(s),'2026-03');
  assert.equal(JSON.stringify(s),before);
  assert.equal(purchase(s).versions,undefined);
});

test('remoção não pode apagar versões históricas ou uma quitação registrada',()=>{
  const changed=change(fixture(),'p','2026-10',data(),'Outubro');
  assert.throws(()=>assertFinancialMutation(changed,{...changed,installmentPurchases:[]}),/não pode ser removido/);
  const settled=payoff(fixture(),'p','2026-07',600,'Quitação');
  assert.throws(()=>assertFinancialMutation(settled,{...settled,installmentPurchases:[]}),/não pode ser removido/);
});

test('entradas inválidas e término fora de 9999 são recusados sem mutação',()=>{
  const s=fixture(), before=structuredClone(s);
  for(const invalid of [{...data(),installmentsCount:0},{...data(),currentInstallment:13},
    {...data(),totalAmount:1.001},{...data(),totalAmount:-1}]) {
    assert.throws(()=>change(s,'p','2026-10',invalid,'Motivo'));
  }
  assert.throws(()=>change(s,'p','2026-13',data(),'Motivo'),/Mês/);
  assert.throws(()=>change(s,'p','2026-10',data(),''),/motivo/);
  assert.throws(()=>change(s,'p','2026-10',{...data(),installmentsCount:2147483647},'Muito longo'),/Mês/);
  assert.deepEqual(s,before);
});

test('mesma fronteira admite nova revisão determinística, sem alterar mês anterior',()=>{
  let s=change(fixture(),'p','2026-10',data(),'Primeira');
  s=change(s,'p','2026-10',{...data(),totalAmount:3600},'Segunda');
  assert.equal(resolve(purchase(s),'2026-10').installmentAmount,300);
  assert.equal(resolve(purchase(s),'2026-09').installmentAmount,100);
  assert.equal(purchase(s).versions!.length,3);
  const returned=resolveInstallmentVersion(purchase(s),'2026-10'); returned.totalAmount=1;
  assert.equal(resolve(purchase(s),'2026-10').totalAmount,3600);
});

test('caminho existente de edição também bloqueia transferência de ocorrência paga',()=>{
  const s=recordPayment(fixture(),'2026-10','p','installment','pago');
  const next={...s,installmentPurchases:applyInstallmentUpdate(s.installmentPurchases,'p','2026-10',data('A'))};
  assert.throws(()=>assertFinancialMutation(s,next),/pagamentos/);
});

test('alteração futura mantém mês fechado anterior, sem snapshots mensais adicionais',()=>{
  let s=fixture(); s.creditCards=[];
  s=closeMonth(recordPayment(s,'2026-09','p','installment','pago'),'2026-09');
  const frozen=structuredClone(s.closedMonths);
  s=change(s,'p','2026-10',data(),'Outubro');
  assert.deepEqual(s.closedMonths,frozen);
  assert.equal(purchase(s).monthlySnapshots,undefined);
});
