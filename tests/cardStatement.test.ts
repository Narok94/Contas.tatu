import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FinanceDataStore } from '../src/domain/financeRules.js';
import type { CardInternalItem, UnifiedMonthlyAccount } from '../src/types/finance.js';
import { cardStatementRows, formatPurchaseDate } from '../src/utils/cardStatement.js';

const fixture = () => {
  const store: FinanceDataStore = { categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [],
    recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] };
  const account: UnifiedMonthlyAccount = { id:'card',name:'Cartão',type:'credit_card',amount:500,status:'pendente',cardInfo:{
    cardId:'card',invoiceStatus:'pendente',items:[],totalItemsCount:0,currentMonthAmount:500,
    previousPendingAmount:0,previousPendingInvoices:[],totalOpenAmount:500,
  } };
  const simple = (id:string,description:string,amount:number,createdAt:string,month='2026-10') => {
    store.cardExpenses.push({id,cardId:'card',description,amount,month,createdAt});
    const item:CardInternalItem={id,sourceId:id,sourceType:'simple_expense',description,amount,isInstallment:false};
    account.cardInfo!.items.push(item);
    return item;
  };
  return {store,account,simple};
};

test('only confirmed October import records recover simple purchase dates; creation dates alone are not purchase dates',()=>{
  const {store,account,simple}=fixture();
  simple('unknown','Outra compra',5,'2026-10-22T15:00:00.000Z');
  simple('created-later','Uber',11.42,'2026-10-30T15:00:00.000Z');
  simple('other-month','Uber',11.42,'2026-10-22T15:00:00.000Z','2026-11');
  simple('confirmed','Uber',11.42,'2026-10-22T15:00:00.000Z');
  const before=JSON.stringify({store,account});
  const rows=cardStatementRows(account,store);
  assert.deepEqual(rows.map(row=>[row.item.id,row.purchaseDate]),[
    ['confirmed','2026-10-22'],['unknown',undefined],['created-later',undefined],['other-month',undefined],
  ]);
  assert.equal(JSON.stringify({store,account}),before);
  store.cardExpenses.push({...store.cardExpenses.find(row=>row.id==='confirmed')!,id:'duplicate'});
  assert.equal(cardStatementRows(account,store).find(row=>row.item.id==='confirmed')?.purchaseDate,undefined,'Ambiguous copies stay undated');
});

test('installment dates use explicit notes, never installment position, start month or creation time',()=>{
  const {store,account}=fixture();
  for(const [id,notes] of [['valid','Data do lançamento: 2026-10-21'],['invalid','Data do lançamento: 2026-02-30'],['unknown','Dia não informado.']]) {
    store.installmentPurchases.push({id,description:id,totalAmount:300,installmentsCount:3,startMonth:'2026-10',creditCardId:'card',notes,createdAt:'2026-10-30T12:00:00Z'});
    account.cardInfo!.items.push({id,sourceId:id,sourceType:'installment',description:id,amount:100,isInstallment:true,
      installmentInfo:{current:2,total:3,remaining:1,purchaseId:id}});
  }
  const rows=cardStatementRows(account,store);
  assert.deepEqual(rows.map(row=>row.purchaseDate),['2026-10-21',undefined,undefined]);
  assert.equal(rows[0].item.installmentInfo?.current,2);
  assert.equal(formatPurchaseDate('2026-10-21'),'21/10/2026');
  assert.equal(formatPurchaseDate(undefined),'Data não informada');
});
