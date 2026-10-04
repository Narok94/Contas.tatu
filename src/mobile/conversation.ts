export interface Preview {
  name: string; amount: number; month: string; count: number; paid: boolean;
  cardId?: string; cardName?: string; categoryId?: string; requiresCard?: boolean;
  location?: string; stage?: 'payment-status' | 'payment-method' | 'ready' | 'answered';
  categoryName?: 'Dinheiro' | 'Cartão';
}
export interface ChatMessage {
  id: string; sequence?: string; authorId: string; authorName: string; role: 'user' | 'assistant'; text: string;
  createdAt: string; linkedFinancialOperationId?: string; preview?: Preview; saved?: boolean;
  originalPreview?: Preview; interactionAuthor?: { id: string; name: string };
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const parcels = /^(?:em\s+)?(\d+)\s*(?:x|vezes|parcelas)$/i;
const money = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?:\s*reais)?$/i;
export function interpret(text: string, month: string, _cards: {id:string;name:string}[], categories: {id:string;name:string}[]): Preview | null {
  // Protect decimal commas before splitting the explicit fields.
  const fields = clean(text).replace(/(\d),(?=\d{1,2}(?:\s*reais)?\s*(?:,|$))/gi, '$1§').split(',').map(s => clean(s.replace(/§/g, ',')));
  if (fields.length === 1) {
    let source = fields[0];
    const count = source.match(/\s+((?:em\s+)?\d+\s*(?:x|vezes|parcelas))$/i);
    if (count) source = source.slice(0, count.index);
    const amount = source.match(/\s+((?:R\$\s*)?\d[\d.,]*(?:\s*reais)?)$/i);
    if (!amount) return null;
    const words = clean(source.slice(0, amount.index)).split(' ');
    if (words.length < 2) return null;
    fields.splice(0, 1, words.shift()!, words.join(' '), amount[1], ...(count ? [count[1]] : []));
  }
  if (fields.length !== 3 && fields.length !== 4) return null;
  const [name, location, raw, installment] = fields;
  const price = raw.match(money), quantity = installment?.match(parcels);
  if (!name || !location || !price || (installment !== undefined && !quantity)) return null;
  const amount = Number(price[1].includes(',') || /\.\d{3}/.test(price[1]) ? price[1].replace(/\./g, '').replace(',', '.') : price[1]);
  const count = quantity ? Number(quantity[1]) : 1;
  if (!(amount > 0 && amount <= 9999999999999.99) || count < 1 || count > 120) return null;
  return { name, location, amount, month, count, paid: false, stage: quantity ? 'ready' : 'payment-status',
    ...(quantity ? { categoryName: 'Cartão', categoryId: categories.find(c => normalize(c.name) === 'cartao')?.id } : {}) };
}
export function answerPreview(p: Preview, answer: string, categories: {id:string;name:string}[]): Preview | null {
  const value = normalize(answer);
  if (p.stage === 'payment-status') {
    if (value === 'sim') return { ...p, paid: true, stage: 'payment-method' };
    if (value === 'nao') return { ...p, paid: false, stage: 'ready' };
  }
  if (p.stage === 'payment-method' && (value === 'dinheiro' || value === 'cartao')) {
    return { ...p, paid: true, stage: 'ready', categoryName: value === 'dinheiro' ? 'Dinheiro' : 'Cartão',
      categoryId: categories.find(c => normalize(c.name) === value)?.id };
  }
  return null;
}
export function previewQuestion(p: Preview) {
  return p.stage === 'payment-status' ? 'Essa compra já foi paga?' : p.stage === 'payment-method' ? 'Como foi pago?' : 'Confira antes de adicionar';
}
export function cardCategoryPreview(p: Preview, categories: {id:string;name:string}[]): Preview {
  const category = categories.find(c => normalize(c.name) === 'cartao');
  if (!category) throw new Error('A categoria Cartão precisa existir antes de confirmar. Nenhuma conta foi adicionada.');
  const { requiresCard: _legacy, cardId: _cardId, cardName: _cardName, ...preview } = p;
  return { ...preview, categoryId: category.id };
}
export function previewCommand(p: Preview) {
  if (p.stage && p.stage !== 'ready') throw new Error('Responda às perguntas antes de confirmar.');
  const notes = p.location ? `Local: ${p.location}` : undefined;
  if (p.count > 1) return { action: 'installment.create', data: { description: p.name, totalAmount: p.amount, installmentsCount: p.count, creditCardId: p.cardId, categoryId: p.categoryId, notes } };
  if (p.cardId) return { action: 'expense.create', data: { description: p.name, amount: p.amount, cardId: p.cardId, categoryId: p.categoryId } };
  return { action: 'simple.create', data: { name: p.name, value: p.amount, paid: p.paid, categoryId: p.categoryId, notes } };
}
