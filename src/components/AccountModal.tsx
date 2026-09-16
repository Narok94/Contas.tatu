import React, { useState, useEffect } from 'react';
import { X, Layers, Repeat, CreditCard as CardIcon, DollarSign, Tag, Calendar, Info } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { AccountType, UnifiedMonthlyAccount } from '../types/finance';
import { calculateInstallmentValue, getInstallmentStatusForMonth } from '../domain/financeRules';
import { formatBRL, formatMonthYear } from '../utils/formatters';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAccount?: UnifiedMonthlyAccount | null;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  editingAccount,
}) => {
  const {
    currentMonth,
    categories,
    creditCards,
    store,
    createSimpleAccount,
    createRecurringAccount,
    createInstallmentPurchase,
    updateAccountValueAndDetails,
  } = useFinance();

  const [activeType, setActiveType] = useState<AccountType>('simple');

  // Campos comuns
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');

  // Campos específicos de parcelada
  const [installmentsCount, setInstallmentsCount] = useState('10');
  const [currentInstallmentNumber, setCurrentInstallmentNumber] = useState('1');
  const [creditCardId, setCreditCardId] = useState<string>('');
  const [startMonth, setStartMonth] = useState(currentMonth);

  // Inicializa quando abre para editar ou criar
  useEffect(() => {
    if (editingAccount) {
      setName(editingAccount.name);
      setCategoryId(editingAccount.categoryId || '');
      setActiveType(editingAccount.type);

      if (editingAccount.type === 'installment') {
        const purchase = store.installmentPurchases.find(
          (p) => p.id === (editingAccount.installmentInfo?.purchaseId || editingAccount.id)
        );

        if (purchase) {
          // Obtém o estado histórico exato do parcelamento para o mês visualizado
          const statusInMonth = getInstallmentStatusForMonth(purchase, currentMonth);
          const historicalCount =
            statusInMonth.totalInstallments ||
            editingAccount.installmentInfo?.totalInstallments ||
            purchase.installmentsCount;
          const historicalCurrent =
            statusInMonth.currentInstallment ||
            editingAccount.installmentInfo?.currentInstallment ||
            1;
          const historicalTotal =
            statusInMonth.totalAmount ||
            editingAccount.installmentInfo?.totalAmount ||
            (editingAccount.amount ? editingAccount.amount * historicalCount : purchase.totalAmount);

          setValue(String(historicalTotal));
          setInstallmentsCount(String(historicalCount));
          setCurrentInstallmentNumber(String(historicalCurrent));
          setCreditCardId(purchase.creditCardId || '');
          setStartMonth(purchase.startMonth);
        } else {
          const totalInst = editingAccount.installmentInfo?.totalInstallments || 1;
          const currInst = editingAccount.installmentInfo?.currentInstallment || 1;
          const estimatedTotal =
            editingAccount.installmentInfo?.totalAmount ||
            (editingAccount.amount || 0) * totalInst;
          setValue(String(estimatedTotal));
          setInstallmentsCount(String(totalInst));
          setCurrentInstallmentNumber(String(currInst));
          setStartMonth(currentMonth);
        }
      } else {
        setValue(editingAccount.amount ? String(editingAccount.amount) : '');
      }
    } else {
      setName('');
      setValue('');
      setCategoryId(categories.length > 0 ? categories[0].id : '');
      setActiveType('simple');
      setInstallmentsCount('10');
      setCurrentInstallmentNumber('1');
      setCreditCardId('');
      setStartMonth(currentMonth);
    }
  }, [editingAccount, isOpen, categories, creditCards, currentMonth, store.installmentPurchases]);

  if (!isOpen) return null;

  const parsedTotal = parseFloat(value.replace(',', '.')) || 0;
  const parsedCount = parseInt(installmentsCount, 10) || 1;
  const calculatedInstallment = calculateInstallmentValue(parsedTotal, parsedCount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numValue = parseFloat(value.replace(',', '.')) || 0;

    if (editingAccount) {
      if (editingAccount.type === 'installment') {
        const totalInst = parseInt(installmentsCount, 10) || 1;
        const currInst = parseInt(currentInstallmentNumber, 10) || 1;

        updateAccountValueAndDetails(
          editingAccount,
          name.trim(),
          numValue,
          categoryId || undefined,
          {
            installmentsCount: totalInst,
            currentInstallment: currInst,
            creditCardId: creditCardId || undefined,
          }
        );
      } else {
        updateAccountValueAndDetails(
          editingAccount,
          name.trim(),
          numValue,
          categoryId || undefined
        );
      }
      onClose();
      return;
    }

    // Criação de nova conta
    if (activeType === 'simple') {
      createSimpleAccount({
        name: name.trim(),
        value: numValue,
        categoryId: categoryId || undefined,
        month: currentMonth,
      });
    } else if (activeType === 'recurring') {
      createRecurringAccount({
        name: name.trim(),
        initialValue: numValue,
        categoryId: categoryId || undefined,
        startMonth: currentMonth,
      });
    } else if (activeType === 'installment') {
      const count = parseInt(installmentsCount, 10) || 1;
      createInstallmentPurchase({
        description: name.trim(),
        totalAmount: numValue,
        installmentsCount: count,
        startMonth: startMonth || currentMonth,
        creditCardId: creditCardId || undefined,
        categoryId: categoryId || undefined,
      });
    }

    onClose();
  };

  return (
    <div
      id="account-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-xs p-4"
    >
      <div
        id="account-modal-box"
        role="dialog"
        aria-modal="true"
        className="tatu-dialog bg-white border border-line rounded-3xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900 tracking-tight">
              {editingAccount ? 'Editar Conta' : 'Nova Conta'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {editingAccount
                ? `Atualize os dados da conta em ${formatMonthYear(currentMonth)}`
                : `Cadastro de despesa para ${formatMonthYear(currentMonth)}`}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Seletor de Tipo de Conta (apenas na criação) */}
          {!editingAccount && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                Tipo de Conta
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveType('simple')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    activeType === 'simple'
                      ? 'border-stone-900 bg-brand text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div className="text-xs font-semibold">Simples</div>
                  <div className="text-[10px] opacity-80 mt-0.5">Apenas este mês</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveType('recurring')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    activeType === 'recurring'
                      ? 'border-blue-700 bg-blue-700 text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Repeat className="w-3 h-3" />
                    Fixa
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">Repete com R$ 0,00</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveType('installment')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    activeType === 'installment'
                      ? 'border-purple-700 bg-purple-700 text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Parcelada
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">Carnê ou cartão</div>
                </button>
              </div>
            </div>
          )}

          {/* Nome / Descrição */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {activeType === 'installment' ? 'Descrição da Compra Parcelada' : 'Nome da Conta'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                activeType === 'recurring'
                  ? 'Ex: Energia Elétrica, Internet Fibra, Academia'
                  : activeType === 'installment'
                  ? 'Ex: Sofá retrátil de sala, Notebook Antônio'
                  : 'Ex: Troca de óleo, Consulta médica'
              }
              className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {activeType === 'installment'
                ? 'Valor Total da Compra (R$)'
                : activeType === 'recurring'
                ? `Valor para este mês (${formatMonthYear(currentMonth)})`
                : 'Valor da Conta (R$)'}
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
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0,00"
                className="w-full pl-10 pr-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {activeType === 'recurring' && (
              <p className="text-[11px] text-stone-500 mt-1">
                * Nos meses seguintes, o valor começará automaticamente em R$ 0,00 até você preencher a conta daquele mês.
              </p>
            )}
          </div>

          {/* Campos para Parcelada */}
          {activeType === 'installment' && (
            <div className="space-y-3 pt-2 border-t border-stone-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Total de Parcelas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                {editingAccount ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Parcela em {formatMonthYear(currentMonth)}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={installmentsCount || '120'}
                      required
                      value={currentInstallmentNumber}
                      onChange={(e) => setCurrentInstallmentNumber(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Mês da 1ª Parcela
                    </label>
                    <input
                      type="month"
                      required
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                )}
              </div>

              {/* Informação calculada em tempo real da parcela */}
              {parsedTotal > 0 && parsedCount > 0 && (
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 flex items-center justify-between">
                  <span>Valor estimado por parcela:</span>
                  <span className="font-bold text-stone-900 text-sm">
                    {parsedCount}x de {formatBRL(calculatedInstallment)}
                  </span>
                </div>
              )}

              {/* Onde foi parcelado */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Local de Lançamento
                </label>
                <select
                  value={creditCardId}
                  onChange={(e) => setCreditCardId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">Parcelamento Avulso (Boleto / Carnê / Financiamento)</option>
                  {creditCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} (Fatura do Cartão)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Se vinculado a um cartão, a parcela entrará automaticamente na fatura mensal fechada.
                </p>
              </div>
            </div>
          )}

          {/* Categoria / Tag */}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Categoria / Classificação
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

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-save-account-modal"
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-strong rounded-xl shadow-xs transition-colors cursor-pointer active:scale-[0.98]"
            >
              {editingAccount ? 'Salvar Alterações' : 'Cadastrar Conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
