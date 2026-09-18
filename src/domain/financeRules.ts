import {
  AccountType,
  ClosedMonthSnapshot,
  CardInternalItem,
  CardPendingPreviousInvoice,
  CardSimpleExpense,
  Category,
  CreditCard,
  CreditCardMonthlyInvoice,
  InstallmentPurchase,
  MonthFinancialSummary,
  PaymentStatus,
  RecurringAccountDefinition,
  RecurringAccountMonthlyRecord,
  SimpleAccount,
  UnifiedMonthlyAccount,
} from '../types/finance';
import { addMonths, compareMonths, getMonthDifference } from '../utils/formatters';

export interface FinanceDataStore {
  closedMonths?: Record<string, ClosedMonthSnapshot>;
  categories: Category[];
  creditCards: CreditCard[];
  simpleAccounts: SimpleAccount[];
  recurringDefinitions: RecurringAccountDefinition[];
  recurringMonthlyRecords: RecurringAccountMonthlyRecord[];
  installmentPurchases: InstallmentPurchase[];
  cardExpenses: CardSimpleExpense[];
  cardMonthlyInvoices: CreditCardMonthlyInvoice[];
}

/**
 * Calcula o valor exato da parcela mensal
 */
export function calculateInstallmentValue(totalAmount: number, installmentsCount: number): number {
  if (installmentsCount <= 0) return 0;
  return Math.round((totalAmount / installmentsCount) * 100) / 100;
}

/**
 * Verifica se uma compra parcelada está ativa em um mês específico
 * e retorna os detalhes da parcela naquele mês.
 * RESPEITA HISTÓRICO:
 * - Se o mês possui snapshot congelado, retorna os dados históricos imutáveis daquele mês.
 * - Caso contrário, calcula conforme a vigência ativa daquele ponto em diante.
 */
export function getInstallmentStatusForMonth(
  purchase: InstallmentPurchase,
  targetMonth: string
): {
  isActive: boolean;
  currentInstallment: number;
  totalInstallments: number;
  remainingInstallments: number;
  installmentAmount: number;
  endMonth: string;
  description?: string;
  categoryId?: string;
  totalAmount: number;
} {
  // 1. Snapshot histórico imutável para meses passados anteriores a edições
  if (purchase.monthlySnapshots && purchase.monthlySnapshots[targetMonth]) {
    const snap = purchase.monthlySnapshots[targetMonth];
    return {
      isActive: true,
      currentInstallment: snap.currentInstallment,
      totalInstallments: snap.totalInstallments,
      remainingInstallments: snap.remainingInstallments,
      installmentAmount: snap.installmentAmount,
      endMonth: snap.endMonth,
      description: snap.description || purchase.description,
      categoryId: snap.categoryId !== undefined ? snap.categoryId : purchase.categoryId,
      totalAmount:
        snap.totalAmount !== undefined
          ? snap.totalAmount
          : snap.installmentAmount * snap.totalInstallments,
    };
  }

  // 2. Cálculo regular a partir do mês de vigência (effectiveFromMonth ou startMonth)
  const effectiveFrom = purchase.effectiveFromMonth || purchase.startMonth;
  if (compareMonths(targetMonth, effectiveFrom) < 0) {
    // Mês anterior à vigência e sem snapshot gravado -> inativo neste mês
    return {
      isActive: false,
      currentInstallment: 0,
      totalInstallments: purchase.installmentsCount,
      remainingInstallments: 0,
      installmentAmount: 0,
      endMonth: '',
      description: purchase.description,
      categoryId: purchase.categoryId,
      totalAmount: purchase.totalAmount,
    };
  }

  const baseNumber = purchase.baseInstallmentNumber || 1;
  const diff = getMonthDifference(effectiveFrom, targetMonth);
  const currentInstallment = baseNumber + diff;
  const totalInstallments = purchase.installmentsCount;
  const remainingInstallments = Math.max(0, totalInstallments - currentInstallment);
  const endMonth = addMonths(effectiveFrom, totalInstallments - baseNumber);
  const isActive = currentInstallment >= 1 && currentInstallment <= totalInstallments;
  const installmentAmount = calculateInstallmentValue(purchase.totalAmount, totalInstallments);

  return {
    isActive,
    currentInstallment,
    totalInstallments,
    remainingInstallments,
    installmentAmount,
    endMonth,
    description: purchase.description,
    categoryId: purchase.categoryId,
    totalAmount: purchase.totalAmount,
  };
}

/**
 * Calcula as faturas pendentes de meses anteriores para um determinado cartão
 * REGRA CRÍTICA:
 * - Cada mês anterior com saldo não pago aparece exatamente UMA vez (origem real).
 * - Ao pagar a fatura de determinado mês, sua pendência é zerada.
 * - Não duplica dívidas entre meses.
 */
export function getPreviousPendingCardInvoices(
  cardId: string,
  targetMonth: string,
  store: FinanceDataStore
): CardPendingPreviousInvoice[] {
  const pastMonthsSet = new Set<string>();

  // Despesas simples anteriores
  for (const exp of store.cardExpenses) {
    if (exp.cardId === cardId && compareMonths(exp.month, targetMonth) < 0) {
      pastMonthsSet.add(exp.month);
    }
  }

  // Parcelas do cartão ativas em meses anteriores
  const cardPurchases = store.installmentPurchases.filter((p) => p.creditCardId === cardId);
  for (const p of cardPurchases) {
    if (p.monthlySnapshots) {
      for (const m of Object.keys(p.monthlySnapshots)) {
        if (compareMonths(m, targetMonth) < 0) {
          pastMonthsSet.add(m);
        }
      }
    }
    const startM = p.startMonth;
    let curM = startM;
    let limit = 0;
    while (compareMonths(curM, targetMonth) < 0 && limit < 120) {
      const st = getInstallmentStatusForMonth(p, curM);
      if (st.isActive) {
        pastMonthsSet.add(curM);
      }
      curM = addMonths(curM, 1);
      limit++;
    }
  }

  // Faturas anteriores registradas
  for (const inv of store.cardMonthlyInvoices) {
    if (inv.cardId === cardId && compareMonths(inv.month, targetMonth) < 0) {
      pastMonthsSet.add(inv.month);
    }
  }

  const sortedPastMonths = Array.from(pastMonthsSet).sort((a, b) => compareMonths(a, b));
  const pendingInvoices: CardPendingPreviousInvoice[] = [];

  for (const m of sortedPastMonths) {
    if (store.closedMonths?.[m]) continue; // Fechamentos só aceitam meses integralmente resolvidos.
    const mExpenses = store.cardExpenses.filter((e) => e.cardId === cardId && e.month === m);
    let mTotal = mExpenses.reduce((sum, e) => sum + e.amount, 0);

    for (const p of cardPurchases) {
      const st = getInstallmentStatusForMonth(p, m);
      if (st.isActive) {
        mTotal += st.installmentAmount;
      }
    }

    const invoiceRecord = store.cardMonthlyInvoices.find(
      (inv) => inv.cardId === cardId && inv.month === m
    );
    const isPaid = invoiceRecord?.status === 'pago';

    if (mTotal > 0 && !isPaid) {
      pendingInvoices.push({
        month: m,
        amount: mTotal,
      });
    }
  }

  return pendingInvoices;
}

/**
 * Resolve o registro mensal de uma conta fixa para o mês alvo.
 * REGRA CRÍTICA:
 * Ao virar o mês, o valor começa em ZERO (R$ 0,00).
 * O valor do mês anterior NÃO é copiado automaticamente.
 */
export function resolveRecurringMonthlyRecord(
  definition: RecurringAccountDefinition,
  records: RecurringAccountMonthlyRecord[],
  targetMonth: string
): RecurringAccountMonthlyRecord {
  const existing = records.find(
    (r) => r.definitionId === definition.id && r.month === targetMonth
  );

  if (existing) {
    return existing;
  }

  // Valor começa em ZERO a cada novo mês
  return {
    id: `rec_rec_${definition.id}_${targetMonth}`,
    definitionId: definition.id,
    month: targetMonth,
    value: 0,
    isValueSet: false,
    status: 'pendente',
  };
}

/**
 * Constrói a lista unificada de contas para visualização na tela operacional
 * em um determinado mês selecionado.
 */
export function computeMonthlyAccounts(
  targetMonth: string,
  store: FinanceDataStore
): UnifiedMonthlyAccount[] {
  if (store.closedMonths?.[targetMonth]) return structuredClone(store.closedMonths[targetMonth].accounts);
  const categoryMap = new Map<string, Category>((store.categories || []).map((c) => [c.id, c]));
  const results: UnifiedMonthlyAccount[] = [];

  // 1. Contas Simples do mês
  const monthlySimples = store.simpleAccounts.filter((s) => s.month === targetMonth);
  for (const simple of monthlySimples) {
    results.push({
      id: simple.id,
      type: 'simple',
      name: simple.name,
      amount: simple.value,
      status: simple.status,
      categoryId: simple.categoryId,
      category: simple.categoryId ? categoryMap.get(simple.categoryId) : undefined,
      notes: simple.notes,
    });
  }

  // 2. Contas Fixas / Recorrentes
  // Se targetMonth >= startMonth e a conta estiver ativa
  const activeDefinitions = store.recurringDefinitions.filter(
    (d) => d.isActive && compareMonths(targetMonth, d.startMonth) >= 0
  );

  for (const def of activeDefinitions) {
    const monthlyRecord = resolveRecurringMonthlyRecord(
      def,
      store.recurringMonthlyRecords,
      targetMonth
    );

    results.push({
      id: def.id,
      type: 'recurring',
      name: def.name,
      amount: monthlyRecord.value,
      status: monthlyRecord.status,
      categoryId: def.categoryId,
      category: def.categoryId ? categoryMap.get(def.categoryId) : undefined,
      notes: def.notes,
      recurringInfo: {
        definitionId: def.id,
        isValueSet: monthlyRecord.isValueSet,
      },
    });
  }

  // 3. Cartões de Crédito (Contas-mãe / Agrupadores)
  for (const card of store.creditCards) {
    // Compras simples do cartão neste mês
    const cardSimpleItems = store.cardExpenses.filter(
      (e) => e.cardId === card.id && e.month === targetMonth
    );

    // Parcelas ativas deste cartão neste mês
    const cardInstallments = store.installmentPurchases.filter(
      (p) => p.creditCardId === card.id
    );

    const internalItems: CardInternalItem[] = [];

    for (const simple of cardSimpleItems) {
      internalItems.push({
        id: simple.id,
        description: simple.description,
        amount: simple.amount,
        categoryId: simple.categoryId,
        category: simple.categoryId ? categoryMap.get(simple.categoryId) : undefined,
        isInstallment: false,
        sourceType: 'simple_expense',
        sourceId: simple.id,
      });
    }

    for (const installment of cardInstallments) {
      const installmentStatus = getInstallmentStatusForMonth(installment, targetMonth);
      if (installmentStatus.isActive) {
        internalItems.push({
          id: `card_item_${installment.id}_${targetMonth}`,
          description: installmentStatus.description || installment.description,
          amount: installmentStatus.installmentAmount,
          categoryId: installmentStatus.categoryId || installment.categoryId,
          category: (installmentStatus.categoryId || installment.categoryId)
            ? categoryMap.get((installmentStatus.categoryId || installment.categoryId)!)
            : undefined,
          isInstallment: true,
          installmentInfo: {
            current: installmentStatus.currentInstallment,
            total: installmentStatus.totalInstallments,
            remaining: installmentStatus.remainingInstallments,
            purchaseId: installment.id,
            endMonth: installmentStatus.endMonth,
            totalAmount: installmentStatus.totalAmount,
          },
          sourceType: 'installment',
          sourceId: installment.id,
        });
      }
    }

    // Calcula o valor total da fatura deste mês específico
    const totalInvoiceAmount = internalItems.reduce((acc, item) => acc + item.amount, 0);

    // Encontra o status da fatura do mês corrente
    const invoiceRecord = store.cardMonthlyInvoices.find(
      (inv) => inv.cardId === card.id && inv.month === targetMonth
    );
    const invoiceStatus: PaymentStatus = invoiceRecord ? invoiceRecord.status : 'pendente';

    // Calcula pendências de faturas anteriores que ainda não foram pagas
    const previousPendingInvoices = getPreviousPendingCardInvoices(card.id, targetMonth, store);
    const previousPendingAmount = previousPendingInvoices.reduce((acc, inv) => acc + inv.amount, 0);
    const totalOpenAmount = (invoiceStatus === 'pago' ? 0 : totalInvoiceAmount) + previousPendingAmount;

    results.push({
      id: card.id,
      type: 'credit_card',
      name: card.name,
      amount: totalInvoiceAmount,
      status: invoiceStatus,
      cardInfo: {
        cardId: card.id,
        invoiceStatus,
        items: internalItems,
        totalItemsCount: internalItems.length,
        currentMonthAmount: totalInvoiceAmount,
        previousPendingAmount,
        previousPendingInvoices,
        totalOpenAmount,
      },
    });
  }

  // 4. Compras Parceladas Avulsas (não vinculadas a nenhum cartão)
  const standaloneInstallments = store.installmentPurchases.filter((p) => !p.creditCardId);
  for (const purchase of standaloneInstallments) {
    const installmentStatus = getInstallmentStatusForMonth(purchase, targetMonth);
    if (installmentStatus.isActive) {
      const monthStatus = purchase.statusByMonth?.[targetMonth] || 'pendente';
      results.push({
        id: purchase.id,
        type: 'installment',
        name: installmentStatus.description || purchase.description,
        amount: purchase.paymentAmountsByMonth?.[targetMonth] ?? installmentStatus.installmentAmount,
        status: monthStatus,
        categoryId: installmentStatus.categoryId || purchase.categoryId,
        category: (installmentStatus.categoryId || purchase.categoryId)
          ? categoryMap.get((installmentStatus.categoryId || purchase.categoryId)!)
          : undefined,
        notes: purchase.notes,
        installmentInfo: {
          purchaseId: purchase.id,
          currentInstallment: installmentStatus.currentInstallment,
          totalInstallments: installmentStatus.totalInstallments,
          remainingInstallments: installmentStatus.remainingInstallments,
          endMonth: installmentStatus.endMonth,
          totalAmount: installmentStatus.totalAmount,
        },
      });
    }
  }

  return results;
}

/**
 * Calcula o resumo financeiro conciso para o Dashboard e Header
 */
export function computeFinancialSummary(
  targetMonth: string,
  store: FinanceDataStore
): MonthFinancialSummary {
  if (store.closedMonths?.[targetMonth]) return structuredClone(store.closedMonths[targetMonth].summary);
  const accounts = computeMonthlyAccounts(targetMonth, store);

  let totalExpected = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let pendingCount = 0;
  let previousPendingCardsTotal = 0;

  const categoryTotals = new Map<string, number>();

  for (const acc of accounts) {
    totalExpected += acc.amount;
    if (acc.status === 'pago') {
      totalPaid += acc.amount;
    } else {
      totalPending += acc.amount;
      pendingCount += 1;
    }

    if (acc.type === 'credit_card' && acc.cardInfo) {
      previousPendingCardsTotal += acc.cardInfo.previousPendingAmount;
    }

    // Para agregação de categorias:
    // Se for cartão, somamos as categorias dos itens internos
    if (acc.type === 'credit_card' && acc.cardInfo) {
      for (const item of acc.cardInfo.items) {
        const catId = item.categoryId || 'sem_categoria';
        categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + item.amount);
      }
    } else {
      const catId = acc.categoryId || 'sem_categoria';
      categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + acc.amount);
    }
  }

  const totalOpenWithPreviousPending = totalPending + previousPendingCardsTotal;

  // Monta as principais categorias
  const categoriesMap = new Map<string, Category>(store.categories.map((c) => [c.id, c]));
  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([catId, amount]) => {
      const cat = categoriesMap.get(catId);
      return {
        categoryId: catId,
        categoryName: cat ? cat.name : 'Geral / Outros',
        categoryColor: cat ? cat.color : '#71717a',
        total: amount,
        percentage: totalExpected > 0 ? Math.round((amount / totalExpected) * 100) : 0,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Parcelas que estão próximas de terminar (faltam 3 ou menos parcelas no mês atual)
  const activeEndingInstallments: MonthFinancialSummary['activeEndingInstallments'] = [];
  const cardsMap = new Map<string, CreditCard>(store.creditCards.map((c) => [c.id, c]));

  for (const purchase of store.installmentPurchases) {
    const status = getInstallmentStatusForMonth(purchase, targetMonth);
    if (status.isActive && status.remainingInstallments <= 3) {
      const card = purchase.creditCardId ? cardsMap.get(purchase.creditCardId) : undefined;
      activeEndingInstallments.push({
        purchaseId: purchase.id,
        description: purchase.description,
        currentInstallment: status.currentInstallment,
        totalInstallments: status.totalInstallments,
        remaining: status.remainingInstallments,
        amount: status.installmentAmount,
        endMonth: status.endMonth,
        cardName: card?.name,
      });
    }
  }

  activeEndingInstallments.sort((a, b) => a.remaining - b.remaining);

  return {
    month: targetMonth,
    totalExpected,
    totalPaid,
    totalPending,
    previousPendingCardsTotal,
    totalOpenWithPreviousPending,
    pendingCount,
    totalCount: accounts.length,
    categoryBreakdown,
    activeEndingInstallments,
  };
}

/** Saldo anterior é operacional: pode ser quitado após o fechamento do mês consultado.
 * As contas do próprio mês e o snapshot histórico permanecem intactos.
 */
export function computeOperationalMonthlyAccounts(month: string, store: FinanceDataStore): UnifiedMonthlyAccount[] {
  return computeMonthlyAccounts(month, store).map(account => {
    if (!account.cardInfo || !store.closedMonths?.[month]) return account;
    const previousPendingInvoices = getPreviousPendingCardInvoices(account.cardInfo.cardId, month, store);
    const previousPendingAmount = previousPendingInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return { ...account, cardInfo: { ...account.cardInfo, previousPendingInvoices, previousPendingAmount,
      totalOpenAmount: (account.status === 'pago' ? 0 : account.amount) + previousPendingAmount } };
  });
}

/**
 * Calcula previsão para os próximos meses
 */
export function computeFutureMonthsForecast(
  startMonth: string,
  monthsCount: number,
  store: FinanceDataStore
): { month: string; expectedTotal: number; installmentsOnly: number; fixedOnly: number }[] {
  const result: { month: string; expectedTotal: number; installmentsOnly: number; fixedOnly: number }[] = [];

  for (let i = 1; i <= monthsCount; i++) {
    const futureMonth = addMonths(startMonth, i);
    const accounts = computeMonthlyAccounts(futureMonth, store);
    let total = 0;
    let installmentsOnly = 0;
    let fixedOnly = 0;

    for (const acc of accounts) {
      total += acc.amount;
      if (acc.type === 'installment') {
        installmentsOnly += acc.amount;
      } else if (acc.type === 'recurring') {
        fixedOnly += acc.amount;
      } else if (acc.type === 'credit_card' && acc.cardInfo) {
        // Soma parcelas dentro do cartão
        const cardInsts = acc.cardInfo.items.filter((item) => item.isInstallment);
        const instSum = cardInsts.reduce((sum, item) => sum + item.amount, 0);
        installmentsOnly += instSum;
      }
    }

    result.push({
      month: futureMonth,
      expectedTotal: total,
      installmentsOnly,
      fixedOnly,
    });
  }

  return result;
}

/**
 * Atualiza uma compra parcelada preservando rigorosamente o histórico dos meses anteriores.
 * REGRA CRÍTICA:
 * - Todos os meses estritamente anteriores a currentMonth que já ocorreram são congelados como snapshots imutáveis.
 * - Registros de meses anteriores (especialmente pagos) não sofrem alterações automáticas.
 * - A nova configuração tem vigência exclusiva a partir de currentMonth para a frente.
 */
export function applyInstallmentUpdate(
  purchases: InstallmentPurchase[],
  purchaseId: string,
  currentMonth: string,
  data: {
    description: string;
    totalAmount: number;
    installmentsCount: number;
    currentInstallment?: number;
    categoryId?: string;
    creditCardId?: string;
  }
): InstallmentPurchase[] {
  return purchases.map((p) => {
    if (p.id !== purchaseId) return p;

    // 1. Preservar histórico imutável:
    // Congelar meses anteriores a currentMonth que estiveram ativos sob a configuração vigente anterior
    const snapshots = { ...(p.monthlySnapshots || {}) };

    let mCursor = p.startMonth;
    let guard = 0;
    while (compareMonths(mCursor, currentMonth) < 0 && guard < 120) {
      if (!snapshots[mCursor]) {
        const oldStatus = getInstallmentStatusForMonth(p, mCursor);
        if (oldStatus.isActive) {
          snapshots[mCursor] = {
            currentInstallment: oldStatus.currentInstallment,
            totalInstallments: oldStatus.totalInstallments,
            remainingInstallments: oldStatus.remainingInstallments,
            installmentAmount: oldStatus.installmentAmount,
            endMonth: oldStatus.endMonth,
            description: p.description,
            categoryId: p.categoryId,
            totalAmount: oldStatus.totalAmount,
          };
        }
      }
      mCursor = addMonths(mCursor, 1);
      guard++;
    }

    // 2. Definir nova vigência a partir de currentMonth para a frente
    const baseInstallmentNumber =
      typeof data.currentInstallment === 'number' && data.currentInstallment >= 1
        ? data.currentInstallment
        : 1;

    return {
      ...p,
      description: data.description.trim(),
      totalAmount: data.totalAmount,
      installmentsCount: data.installmentsCount,
      effectiveFromMonth: currentMonth,
      baseInstallmentNumber,
      categoryId: data.categoryId,
      creditCardId:
        data.creditCardId !== undefined
          ? data.creditCardId || undefined
          : p.creditCardId,
      monthlySnapshots: snapshots,
    };
  });
}
