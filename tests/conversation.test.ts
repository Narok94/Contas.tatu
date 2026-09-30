import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpret, previewCommand } from '../src/mobile/conversation';
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
