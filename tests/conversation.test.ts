import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpret, previewCommand, cardCategoryPreview } from '../src/mobile/conversation';
const cards = [{id:'nubank',name:'Nubank'}];
const categories = [{id:'home',name:'Casa'}];
const parse = (s: string) => interpret(s, '2026-09', cards, categories);
test('common monetary amounts and clean descriptions', () => {
  for (const [text, amount] of [['luz 200',200], ['internet 119,90',119.9], ['tv 5 mil',5000], ['sofa 2500',2500], ['tv 5.000,00',5000]] as const) assert.equal(parse(text)?.amount, amount);
  assert.equal(parse('A conta de luz esse mês veio 200 reais')?.name, 'Conta de luz');
  assert.equal(parse('luz 200')?.categoryId, 'home');
});
test('installments and existing card', () => {
  for (const ending of ['em 10 vezes', '10x', 'em 12']) assert.equal(parse(`tv 5000 ${ending} no Nubank`)?.count, ending === 'em 12' ? 12 : 10);
  const p = parse('Comprei uma TV 50 polegadas por 5 mil reais em 10 vezes no Nubank')!;
  assert.equal(p.name, 'TV 50 polegadas'); assert.equal(p.amount,5000); assert.equal(p.cardId,'nubank');
  assert.equal(previewCommand(p).action,'installment.create');
});
test('paid status and month default', () => {
  for (const status of ['pago','já paga','já está paga']) { const p = parse(`mercado 350 ${status}`)!; assert.equal(p.paid,true); assert.equal(p.month,'2026-09'); assert.equal(p.name,'Mercado'); }
});
test('ambiguity never creates a preview', () => {
  for (const s of ['luz', '200', 'luz 200 ou 300', 'tv 500 em 0', 'tv 500 no desconhecido', 'luz -200', 'luz 200 amanhã', 'tv 500 10x pago']) assert.equal(parse(s),null,s);
});

test('no cartão means the existing Cartão category, never a card selector',()=>{
  const categories=[{id:'category-card',name:'Cartão'},{id:'market',name:'Mercado'}];
  for(const phrase of ['Fiz uma compra de 80 reais no mercado alvorada no cartão','mercado alvorada 80 no cartão','comprei 80 reais no mercado no cartão','gastei 80 no cartão']) {
    const p=interpret(phrase,'2026-10',cards,categories)!;
    assert.ok(p);assert.equal(p.amount,80);assert.equal(p.month,'2026-10');assert.equal(p.categoryId,'category-card');
    assert.equal(p.cardId,undefined);assert.equal(p.requiresCard,undefined);
    assert.equal(p.name,phrase.includes('alvorada')?'Mercado Alvorada':phrase.includes('mercado')?'Mercado':'Compra no cartão');
    assert.equal(previewCommand(p).action,'simple.create');
  }
  assert.equal(interpret('mercado 80 no cartão','2026-10',cards,[]),null);
  const legacy=cardCategoryPreview({name:'Mercado',amount:80,month:'2026-10',count:1,paid:false,requiresCard:true},categories);
  assert.equal('requiresCard' in legacy,false);assert.equal(legacy.categoryId,'category-card');
});
test('named card purchase cleans verbs and merchant prepositions', () => {
  const p=parse('gastei 80 no mercado alvorada no Nubank')!;
  assert.equal(p.name,'Mercado Alvorada'); assert.equal(p.amount,80);
  assert.equal(p.cardId,'nubank'); assert.equal(p.cardName,'Nubank'); assert.equal(p.requiresCard,undefined);
  assert.equal(previewCommand(p).action,'expense.create');
  assert.equal(parse('Fiz uma compra de 80 reais no mercado alvorada no cartão pago'),null);
});

test('natural pharmacy purchases extract total, installments and card category in any order',()=>{
  const categories=[{id:'card-category',name:'Cartão'}];
  for(const [phrase,name,count,category] of [
    ['Fiz uma compra de 635 reais na Farmácia Drogasil em 6 vezes no cartão','Farmácia Drogasil',6,'card-category'],
    ['drogasil 635 em 6x no cartão','Drogasil',6,'card-category'],
    ['comprei 635 na drogasil em 6 vezes','Drogasil',6,undefined],
    ['farmácia 635 cartão 6x','Farmácia',6,'card-category'],
    ['em 6 vezes no cartão na Farmacia Drogasil comprei 635 reais','Farmácia Drogasil',6,'card-category'],
    ['comprie 635 reias na farmcia Drogasil em 6 veses no cartoa','Farmácia Drogasil',6,'card-category'],
    ['comprei 635 na drogasil','Drogasil',1,undefined],
  ] as const) {
    const p=interpret(phrase,'2026-10',cards,categories)!;
    assert.ok(p,phrase);assert.equal(p.name,name,phrase);assert.equal(p.amount,635);
    assert.equal(p.count,count);assert.equal(p.categoryId,category);assert.equal(p.month,'2026-10');
    assert.equal(p.cardId,undefined);assert.equal(p.requiresCard,undefined);
    if(count>1){const command=previewCommand(p);assert.equal(command.action,'installment.create');assert.equal(command.data.totalAmount,635);assert.equal(command.data.installmentsCount,6);}
  }
  assert.equal(interpret('farmácia 635 cartão 6x 8x','2026-10',cards,categories),null);
  assert.equal(interpret('farmácia 635 ou 700 cartão 6x','2026-10',cards,categories),null);
});
