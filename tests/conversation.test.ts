import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpret, answerPreview, previewCommand } from '../src/mobile/conversation';
const categories=[{id:'cash',name:'Dinheiro'},{id:'card',name:'Cartão'}];
const parse=(s:string)=>interpret(s,'2026-10',[],categories);
test('description, location and price are explicit and do not require a product vocabulary',()=>{
 for(const [input,name,location,amount] of [
 ['Compras, Mercearia do Ceará, 10 reais','Compras','Mercearia do Ceará',10],
 ['Chocolate, Padaria, 10 reais','Chocolate','Padaria',10],
 ['Material escolar, Loja desconhecida, R$ 10,50','Material escolar','Loja desconhecida',10.5],
 ['Chocolate Padaria 10 reais','Chocolate','Padaria',10],
 ['Compras Mercearia do Ceará 10 reais','Compras','Mercearia do Ceará',10],
 ] as const){const p=parse(input)!;assert.equal(p.name,name);assert.equal(p.location,location);assert.equal(p.amount,amount);assert.equal(p.stage,'payment-status');assert.equal(p.month,'2026-10');assert.throws(()=>previewCommand(p));}
 for(const amount of ['10','10 reais','R$ 10','10,50','R$ 10,50','10.50','1.234,50']) assert.ok(parse(`Produto, Local, ${amount}`),amount);
});
test('installments go straight to confirmation and always use Cartão',()=>{
 for(const [input,name,location,amount,count] of [
 ['Remédios, Drogaria Araújo, 347 reais, 10x','Remédios','Drogaria Araújo',347,10],
 ['Ração, Petshop, 300, 8 vezes','Ração','Petshop',300,8],
 ['TV, Casas Bahia, 5000 reais, 12 vezes','TV','Casas Bahia',5000,12],
 ['Ração, Petshop, 300, em 8 parcelas','Ração','Petshop',300,8],
 ['Produto, Loja, 10,50, 2x','Produto','Loja',10.5,2],
 ] as const){const p=parse(input)!;assert.equal(p.name,name);assert.equal(p.location,location);assert.equal(p.amount,amount);assert.equal(p.count,count);assert.equal(p.stage,'ready');assert.equal(p.categoryName,'Cartão');assert.equal(p.cardId,undefined);assert.equal(previewCommand(p).data.totalAmount,amount);}
});
test('Sim then Dinheiro shows a paid preview; Não shows a pending preview',()=>{
 const start=parse('Chocolate, Padaria, 10')!;
 const yes=answerPreview(start,'Sim',categories)!;assert.equal(yes.stage,'payment-method');assert.throws(()=>previewCommand(yes));
 const cash=answerPreview(yes,'Dinheiro',categories)!;assert.equal(cash.categoryName,'Dinheiro');assert.equal(cash.categoryId,'cash');assert.equal(cash.stage,'ready');assert.equal(cash.paid,true);assert.equal(previewCommand(cash).data.notes,'Local: Padaria');
 const no=answerPreview(start,'Não',categories)!;assert.equal(no.stage,'ready');assert.equal(no.paid,false);assert.equal(no.categoryId,undefined);
 const card=answerPreview(yes,'cartao',categories)!;assert.equal(card.categoryName,'Cartão');assert.equal(card.cardId,undefined);
 assert.equal(answerPreview(start,'Dinheiro',categories),null);
});
test('invalid fields are rejected and historic previews remain confirmable',()=>{
 for(const text of ['Produto, Loja','Produto, Loja, -10','Produto, Loja, 10, 0x','Produto, Loja, 10, 121x','Produto, Loja, 10, errado',' , Loja, 10'])assert.equal(parse(text),null,text);
 assert.equal(previewCommand({name:'Antiga',amount:10,month:'2026-10',count:1,paid:false}).action,'simple.create');
});
