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
const typoCorrections: [RegExp, string][] = [
  [/\b(?:comprie|comrpei|conprei)\b/g, 'comprei'],
  [/\b(?:veses|vezess|vezs)\b/g, 'vezes'],
  [/\b(?:cartoa|catao|carto)\b/g, 'cartao'],
  [/\breias\b/g, 'reais'], [/\b(?:farmcia|farmarcia)\b/g, 'farmacia'],
];
const installmentPattern = /\bem\s+(\d+)\s*(?:vezes|x)?\b|\b(\d+)\s*(?:x|vezes)\b/g;
const moneyPattern = /(?<![\w\d])(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(mil)?(?:\s*reais)?(?![\w\d])/g;

function detectAmount(source: string, installments: RegExpMatchArray[]) {
  // Installment counts and product units are not prices, regardless of position.
  const prices = [...source.matchAll(moneyPattern)].filter(price => !installments.some(part =>
    price.index! >= part.index! && price.index! < part.index! + part[0].length));
  if (prices.length !== 1) return null;
  const match = prices[0], raw = match[1];
  const amount = Number(raw.includes(',') || /\.\d{3}/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw) * (match[2] ? 1000 : 1);
  return Number.isFinite(amount) && amount > 0 && amount <= 9999999999999.99 ? { match, amount } : null;
}

function cleanDescription(source: string, original: string) {
  const remaining = source
    .replace(/\bfiz\s+(?:uma\s+)?compra\s*(?:de\b)?/g, ' ')
    .replace(/\b(?:comprei|gastei|paguei|coloquei|esse mes|este mes|veio)\b/g, ' ')
    .replace(/\bconta de\b/g, ' ').replace(/_/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s,;.!?]+|[\s,;.!?]+$/g, '')
    .replace(/^(?:(?:a|o|uma?|no|na|por|de)\s+)+/, '')
    .replace(/\s+(?:por|no|na|de)$/, '').trim();
  if (!remaining) return '';
  const originalWords = original.match(/\p{L}+/gu) ?? [];
  const restored = remaining.replace(/\p{L}+/gu, word => word === 'farmacia' ? 'farmácia' :
    originalWords.find(item => normalize(item) === word)?.toLowerCase() ?? word);
  if (remaining === 'luz') return 'Conta de luz';
  return /^(?:mercado|farmacia|drogasil)\b/.test(remaining)
    ? restored.replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase())
    : restored.replace(/^tv\b/, 'TV').replace(/^./, c => c.toUpperCase());
}

export function interpret(text: string, month: string, cards: { id: string; name: string }[], categories: { id: string; name: string }[]): Preview | null {
  let source = normalize(text).trim();
  for (const [pattern, replacement] of typoCorrections) source = source.replace(pattern, replacement);
  if (!source || /-\s*\d/.test(source) || /\b(ou|talvez|acho|nao|ontem|amanha|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(source)) return null;
  source = source.replace(/\b(\d+)\s*(polegadas|litros|kg)\b/g, '$1_$2');
  const installments = [...source.matchAll(installmentPattern)];

  // Layer 1: one unambiguous monetary value.
  const price = detectAmount(source, installments);
  if (!price) return null;
  // Layer 2: optional installment count; never silently discard invalid counts.
  if (installments.length > 1) return null;
  const count = installments.length ? Number(installments[0][1] ?? installments[0][2]) : 1;
  if (count < 1 || count > 120) return null;
  // Layer 3: category/payment keywords and legacy explicitly named cards.
  const cardCategory = /\bcartao\b/.test(source);
  const matched = cardCategory ? [] : cards.filter(card => source.includes(normalize(card.name)));
  if (matched.length > 1) return null;
  const card = matched[0];
  const paid = /\b(?:pago|paga|paguei)\b/.test(source);
  if (paid && (card || cardCategory || count > 1)) return null;
  // Layer 4: remove only extracted fields, leaving merchant prepositions intact.
  let remaining = source.replace(price.match[0], ' ');
  for (const installment of installments) remaining = remaining.replace(installment[0], ' ');
  remaining = remaining.replace(/\b(?:no\s+)?cartao\b/g, ' ')
    .replace(/\b(?:ja\s+)?(?:esta\s+)?pag[oa]\b/g, ' ');
  if (card) remaining = remaining.replace(normalize(card.name), ' ').replace(/\bno\s*$/, ' ');
  // Layer 5/6: clean verbs and leading connectors, then use the residual description.
  const name = cleanDescription(remaining, text) || (cardCategory ? 'Compra no cartão' : '');
  if (!name) return null;
  const suggested = cardCategory ? 'cartao' : /luz|agua|internet|aluguel/.test(normalize(name)) ? 'casa' : /mercado/.test(normalize(name)) ? 'mercado' : /gasolina/.test(normalize(name)) ? 'transporte' : '';
  const categoryId = categories.find(category => normalize(category.name) === suggested)?.id;
  if (cardCategory && !categoryId) return null; // No invented IDs or wrong-category writes.
  return { name, amount: price.amount, month, count, paid, cardId: card?.id, cardName: card?.name, categoryId };
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
