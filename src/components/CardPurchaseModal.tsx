import React, { useState, useEffect } from 'react';
import { X, CreditCard as CardIcon, ShoppingBag, Layers } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { calculateInstallmentValue, getInstallmentStatusForMonth } from '../domain/financeRules';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { CardInternalItem } from './CreditCardAccountCard';

interface CardPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  editingItem?: CardInternalItem | null;
}

export const CardPurchaseModal: React.FC<CardPurchaseModalProps> = ({
  isOpen,
  onClose,
  cardId,
  editingItem,
}) => {
  const {
    currentMonth,
    categories,
    creditCards,
    store,
    createCardExpense,
    createInstallmentPurchase,
    updateCardExpense,
    updateInstallmentPurchase,
  } = useFinance();

  const currentCard = creditCards.find((c) => c.id === cardId);

  const [purchaseType, setPurchaseType] = useState<'simple' | 'installment'>('simple');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('3');
  const [currentInstallmentNumber, setCurrentInstallmentNumber] = useState('1');
  const [categoryId, setCategoryId] = useState(categories.length > 0 ? categories[0].id : '');

  useEffect(() => {
    if (editingItem) {
      setDescription(editingItem.description);
      setCategoryId(editingItem.categoryId || '');

      if (editingItem.sourceType === 'installment') {
        setPurchaseType('installment');
        const purchase = store.installmentPurchases.find((p) => p.id === editingItem.sourceId);
        if (purchase) {
          const statusInMonth = getInstallmentStatusForMonth(purchase, currentMonth);
          const historicalCount =
            statusInMonth.totalInstallments ||
            editingItem.installmentInfo?.total ||
            purchase.installmentsCount;
          const historicalCurrent =
            statusInMonth.currentInstallment ||
            editingItem.installmentInfo?.current ||
            1;
          const historicalTotal =
            statusInMonth.totalAmount ||
            editingItem.installmentInfo?.totalAmount ||
            (editingItem.amount ? editingItem.amount * historicalCount : purchase.totalAmount);

          setAmount(String(historicalTotal));
          setInstallmentsCount(String(historicalCount));
          setCurrentInstallmentNumber(String(historicalCurrent));
        } else {
          const totalInst = editingItem.installmentInfo?.total || 1;
          const currInst = editingItem.installmentInfo?.current || 1;
          const totalAmt =
            editingItem.installmentInfo?.totalAmount ||
            (editingItem.amount ? editingItem.amount * totalInst : 0);
          setAmount(String(totalAmt));
          setInstallmentsCount(String(totalInst));
          setCurrentInstallmentNumber(String(currInst));
        }
      } else {
        setPurchaseType('simple');
        setAmount(String(editingItem.amount));
      }
    } else {
      setDescription('');
      setAmount('');
      setPurchaseType('simple');
      setInstallmentsCount('3');
      setCurrentInstallmentNumber('1');
      setCategoryId(categories.length > 0 ? categories[0].id : '');
    }
  }, [editingItem, isOpen, categories, store.installmentPurchases]);

  if (!isOpen || !currentCard) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount.replace(',', '.')) || 0;

    if (editingItem) {
      if (editingItem.sourceType === 'simple_expense') {
        updateCardExpense(editingItem.sourceId, {
          description: description.trim(),
          amount: numAmount,
          categoryId: categoryId || undefined,
        });
      } else {
        const count = parseInt(installmentsCount, 10) || 1;
        const curr = parseInt(currentInstallmentNumber, 10) || 1;
        updateInstallmentPurchase(editingItem.sourceId, {
          description: description.trim(),
          totalAmount: numAmount,
          installmentsCount: count,
          currentInstallment: curr,
          categoryId: categoryId || undefined,
          creditCardId: cardId,
        });
      }
      onClose();
      return;
    }

    // Criação nova
    if (purchaseType === 'simple') {
      createCardExpense({
        cardId,
        description: description.trim(),
        amount: numAmount,
        month: currentMonth,
        categoryId: categoryId || undefined,
      });
    } else {
      const count = parseInt(installmentsCount, 10) || 1;
      createInstallmentPurchase({
        description: description.trim(),
        totalAmount: numAmount,
        installmentsCount: count,
        startMonth: currentMonth,
        creditCardId: cardId,
        categoryId: categoryId || undefined,
      });
    }

    onClose();
  };

  const parsedTotal = parseFloat(amount.replace(',', '.')) || 0;
  const parsedCount = parseInt(installmentsCount, 10) || 1;
  const calculatedInstallment = calculateInstallmentValue(parsedTotal, parsedCount);

  return (
    <div
      id="card-purchase-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-xs p-4"
    >
      <div
        id="card-purchase-modal-box"
        role="dialog"
        aria-modal="true"
        className="tatu-dialog bg-white border border-line rounded-3xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900 tracking-tight">
              {editingItem ? 'Editar Compra do Cartão' : 'Adicionar Compra no Cartão'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {currentCard.name} • {formatMonthYear(currentMonth)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Tipo de compra no cartão (se for criação) */}
          {!editingItem && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPurchaseType('simple')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  purchaseType === 'simple'
                    ? 'border-stone-900 bg-brand text-white shadow-xs'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  À Vista no Cartão
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">Apenas nesta fatura</div>
              </button>

              <button
                type="button"
                onClick={() => setPurchaseType('installment')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  purchaseType === 'installment'
                    ? 'border-purple-700 bg-purple-700 text-white shadow-xs'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Parcelada no Cartão
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">Lança nas faturas futuras</div>
              </button>
            </div>
          )}

          {/* Se estiver editando, indica o tipo */}
          {editingItem && (
            <div className="text-xs font-semibold text-stone-600 bg-stone-50 p-2 rounded-lg border border-stone-200/80">
              Tipo:{' '}
              <span className="text-purple-700 font-bold">
                {editingItem.sourceType === 'installment'
                  ? 'Compra Parcelada no Cartão'
                  : 'Compra Avulsa à Vista'}
              </span>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Descrição da Compra
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Mercado Pão de Açúcar, Passagens Aéreas, Farmácia"
              className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {purchaseType === 'installment'
                ? 'Valor Total da Compra (R$)'
                : 'Valor da Compra (R$)'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2 text-sm font-medium text-stone-400">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-10 pr-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {/* Se parcelada, número de parcelas e parcela atual */}
          {purchaseType === 'installment' && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Total de Parcelas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                {editingItem ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Parcela nesta Fatura
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={installmentsCount || '60'}
                      required
                      value={currentInstallmentNumber}
                      onChange={(e) => setCurrentInstallmentNumber(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Início da Parcela
                    </label>
                    <input
                      type="text"
                      disabled
                      value={formatMonthYear(currentMonth)}
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 bg-stone-100 text-stone-600 rounded-lg"
                    />
                  </div>
                )}
              </div>

              {parsedTotal > 0 && parsedCount > 0 && (
                <div className="p-2.5 bg-purple-50/70 border border-purple-100 rounded-lg text-xs text-purple-900 flex items-center justify-between">
                  <span>Valor na fatura:</span>
                  <span className="font-bold text-sm">
                    {parsedCount}x de {formatBRL(calculatedInstallment)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Categoria */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Categoria / Tag
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Sem categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-save-card-purchase"
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-strong rounded-xl shadow-xs transition-colors cursor-pointer active:scale-[0.98]"
            >
              {editingItem ? 'Salvar Alteração' : 'Lançar no Cartão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
