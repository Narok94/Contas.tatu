export interface Preview {
  name: string; amount: number; month: string; count: number; paid: boolean;
  cardId?: string; cardName?: string; categoryId?: string;
  requiresCard?: boolean;
}
export interface ChatMessage {
  id: string; sequence?: string; authorId: string; authorName: string; role: 'user' | 'assistant'; text: string;
  createdAt: string; linkedFinancialOperationId?: string; preview?: Preview; saved?: boolean;
  originalPreview?: Preview;
  interactionAuthor?: { id: string; name: string };
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function interpret(text: string, month: string, cards: { id: string; name: string }[], categories: { id: string; name: string }[]): Preview | null {
  let s = normalize(text).trim()
    .replace(/\b(?:comprie|comrpei|conprei)\b/g, 'comprei')
    .replace(/\b(?:veses|vezess|vezs)\b/g, 'vezes')
    .replace(/\b(?:cartoa|catao|carto)\b/g, 'cartao')
    .replace(/\b(?:reias|reais)\b/g, 'reais')
    .replace(/\b(?:farmcia|farmarcia)\b/g, 'farmacia');
  if (/-\s*\d/.test(s)) return null;
  if (!s || /\b(ou|talvez|acho|nao|ontem|amanha|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(s)) return null;
  const matched = cards.filter(c => s.includes(normalize(c.name)));
  if (matched.length > 1) return null;
  const cardCategory = /\bcartao\b/.test(s);
  const card = cardCategory ? undefined : matched[0];
  if (card) s = s.replace(normalize(card.name), '');
  else if (!cardCategory && /\bno\s+(?!mercado\b|supermercado\b|restaurante\b|posto\b|shopping\b)/.test(s)) return null;
  const installments = [...s.matchAll(/\bem\s+(\d+)\s*(?:vezes|x)?\b|\b(\d+)\s*(?:x|vezes)\b/g)];
  if (installments.length > 1) return null;
  const count = installments.length ? Number(installments[0][1] ?? installments[0][2]) : 1;
  if (count < 1 || count > 120) return null;
  if (installments.length) s = s.replace(installments[0][0], '');
  const paid = /\b(pago|paga)\b/.test(s);
  if (paid && (card || cardCategory || count > 1)) return null; // Payment owner differs; use the existing manual flow.
  s = s.replace(/\b(?:ja\s+)?(?:esta\s+)?pag[oa]\b/g, '').replace(/\b(\d+)\s*(polegadas|litros|kg)\b/g, '$1_$2');
  const amounts = [...s.matchAll(/(?<![\w\d])(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(mil)?(?:\s*reais)?(?![\w\d])/g)];
  if (amounts.length !== 1) return null;
  const m = amounts[0];
  const amount = Number(m[1].includes(',') || /\.\d{3}/.test(m[1]) ? m[1].replace(/\./g, '').replace(',', '.') : m[1]) * (m[2] ? 1000 : 1);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999999.99) return null;
  s = s.replace(m[0], '').replace(/\bfiz\s+(?:uma\s+)?compra\s*(?:de\b)?/g, ' ').replace(/\b(a|o|uma?|comprei|gastei|conta de|esse mes|este mes|veio|por|no|na|cartao|r\$)\b/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (/-\s*\d/.test(s)) return null;
  if (!s && cardCategory) s = 'compra no cartão';
  if (!s || /\b(em|vezes)\b/.test(s)) return null;
  // Restore accents from the user's words without guessing unfamiliar merchants.
  const originalWords = text.match(/\p{L}+/gu) ?? [];
  const description = s.replace(/\p{L}+/gu, word => word === 'farmacia' ? 'farmácia' :
    originalWords.find(original => normalize(original) === word)?.toLowerCase() ?? word);
  const name = s === 'luz' ? 'Conta de luz' : /^(?:mercado|farmacia|drogasil)\b/.test(s)
    ? description.replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase())
    : description.replace(/^tv\b/, 'TV').replace(/^./, c => c.toUpperCase());
  const suggested = cardCategory ? 'cartao' : /luz|agua|internet|aluguel/.test(s) ? 'casa' : /mercado/.test(s) ? 'mercado' : /gasolina/.test(s) ? 'transporte' : '';
  const categoryId = categories.find(c => normalize(c.name) === suggested)?.id;
  if (cardCategory && !categoryId) return null; // Never invent a category ID or save under the wrong category.
  return { name, amount, month, count, paid, cardId: card?.id, cardName: card?.name, categoryId };
}
export function cardCategoryPreview(p: Preview, categories: {id:string;name:string}[]): Preview {
  const category = categories.find(c => normalize(c.name) === 'cartao');
  if (!category) throw new Error('A categoria Cartão precisa existir antes de confirmar. Nenhuma conta foi adicionada.');
  const { requiresCard: _legacy, cardId: _cardId, cardName: _cardName, ...preview } = p;
  return { ...preview, categoryId: category.id };
}
export function previewCommand(p: Preview) {

  if (p.count > 1) return { action: 'installment.create', data: { description: p.name, totalAmount: p.amount, installmentsCount: p.count, creditCardId: p.cardId, categoryId: p.categoryId } };
  if (p.cardId) return { action: 'expense.create', data: { description: p.name, amount: p.amount, cardId: p.cardId, categoryId: p.categoryId } };
  return { action: 'simple.create', data: { name: p.name, value: p.amount, paid: p.paid, categoryId: p.categoryId } };
}
