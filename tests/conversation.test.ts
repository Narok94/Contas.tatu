import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpret, previewCommand, choosePreviewCard } from '../src/mobile/conversation';
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

test('natural card purchase asks for an existing card without creating a simple account', () => {
  for (const phrase of ['Fiz uma compra de 80 reais no mercado alvorada no cartão', 'mercado alvorada 80 no cartão', 'comprei 80 reais no mercado no cartão']) {
    const p = parse(phrase)!;
    assert.ok(p, phrase); assert.equal(p.amount,80); assert.equal(p.month,'2026-09');
    assert.equal(p.name, phrase.includes('alvorada') ? 'Mercado Alvorada' : 'Mercado');
    assert.equal(p.requiresCard,true); assert.equal(p.cardId,undefined);
    assert.throws(()=>previewCommand(p));
    assert.throws(()=>choosePreviewCard(p,'missing',cards));
    assert.throws(()=>choosePreviewCard(p,'',[]));
    const selected=choosePreviewCard(p,'nubank',cards);
    assert.equal(selected.cardId,'nubank'); assert.equal(selected.requiresCard,undefined);
    assert.equal('requiresCard' in selected,false); // Existing confirmation API needs no new fields.
    assert.equal(previewCommand(selected).action,'expense.create');
    assert.equal(previewCommand(selected).data.description,'Mercado Alvorada' === p.name ? 'Mercado Alvorada':'Mercado');
    assert.equal(p.cardId,undefined);
  }
});

test('named card purchase cleans verbs and merchant prepositions', () => {
  const p=parse('gastei 80 no mercado alvorada no Nubank')!;
  assert.equal(p.name,'Mercado Alvorada'); assert.equal(p.amount,80);
  assert.equal(p.cardId,'nubank'); assert.equal(p.cardName,'Nubank'); assert.equal(p.requiresCard,undefined);
  assert.equal(previewCommand(p).action,'expense.create');
  assert.equal(parse('Fiz uma compra de 80 reais no mercado alvorada no cartão pago'),null);
});
