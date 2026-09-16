import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import {
  addMonths,
  formatMonthYear,
  getCurrentMonth,
  MONTH_SHORT_NAMES_PT,
} from '../utils/formatters';

interface MonthSelectorProps {
  currentMonth: string;
  onMonthChange: (newMonth: string) => void;
  className?: string;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  currentMonth,
  onMonthChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extrai ano e mês atuais da seleção
  const [currentYearStr, currentMonthNumStr] = currentMonth.split('-');
  const [pickerYear, setPickerYear] = useState<number>(() =>
    parseInt(currentYearStr || '2026', 10)
  );

  // Sincroniza ano do picker quando currentMonth mudar
  useEffect(() => {
    if (currentMonth) {
      const [y] = currentMonth.split('-');
      setPickerYear(parseInt(y, 10));
    }
  }, [currentMonth]);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const systemCurrentMonth = getCurrentMonth();
  const isCurrentSystemMonth = currentMonth === systemCurrentMonth;

  const handlePrev = () => {
    onMonthChange(addMonths(currentMonth, -1));
  };

  const handleNext = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  const handleResetToCurrent = () => {
    onMonthChange(systemCurrentMonth);
    setIsOpen(false);
  };

  const handleSelectMonth = (monthIndex: number) => {
    const monthNum = String(monthIndex + 1).padStart(2, '0');
    const selected = `${pickerYear}-${monthNum}`;
    onMonthChange(selected);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex items-center gap-2 ${className}`}>
      <div className="flex items-center bg-white/95 border border-line rounded-xl shadow-2xs px-1 py-1 hover:border-line-strong transition-colors">
        <button
          id="btn-prev-month"
          type="button"
          onClick={handlePrev}
          title="Mês anterior"
          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-canvas rounded-lg transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Botão Clicável de Mês/Ano que abre o Seletor */}
        <button
          id="btn-month-picker-toggle"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title="Clique para escolher mês e ano diretamente"
          className="px-2.5 py-1 text-center min-w-[145px] sm:min-w-[160px] flex items-center justify-center gap-1.5 hover:bg-surface-soft rounded-lg transition-colors cursor-pointer group"
        >
          <span className="text-xs sm:text-sm font-semibold tracking-tight text-stone-800 capitalize">
            {formatMonthYear(currentMonth)}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-stone-400 group-hover:text-stone-600 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <button
          id="btn-next-month"
          type="button"
          onClick={handleNext}
          title="Próximo mês"
          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-canvas rounded-lg transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Botão Mês Atual Visível (aparece apenas se estiver em outro mês) */}
      {!isCurrentSystemMonth && (
        <button
          id="btn-current-month-reset"
          type="button"
          onClick={handleResetToCurrent}
          title="Voltar para o mês corrente real"
          className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 bg-white/90 hover:bg-surface-soft border border-line px-2.5 py-1.5 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
        >
          <Calendar className="w-3 h-3 text-brand" />
          <span>Hoje</span>
        </button>
      )}

      {/* Popover Seletor Rápido de Mês e Ano */}
      {isOpen && (
        <div
          id="popover-month-year-picker"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-72 bg-white rounded-2xl border border-line shadow-lg p-3.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Navegação de Ano */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
            <button
              type="button"
              onClick={() => setPickerYear((prev) => prev - 1)}
              className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              title="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-stone-900">
              {pickerYear}
            </span>
            <button
              type="button"
              onClick={() => setPickerYear((prev) => prev + 1)}
              className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              title="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grade de 12 Meses */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_SHORT_NAMES_PT.map((mName, idx) => {
              const monthNumStr = String(idx + 1).padStart(2, '0');
              const isSelected =
                pickerYear === parseInt(currentYearStr, 10) &&
                idx === parseInt(currentMonthNumStr, 10) - 1;
              const isSystemNow =
                `${pickerYear}-${monthNumStr}` === systemCurrentMonth;

              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-xl transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-brand text-white shadow-2xs'
                      : isSystemNow
                      ? 'bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100'
                      : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {mName}
                  {isSystemNow && !isSelected && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Botão de Atalho para Mês Atual dentro do Popover */}
          <div className="mt-2.5 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={handleResetToCurrent}
              className="w-full py-1 text-xs font-semibold text-stone-600 hover:text-brand hover:bg-surface-soft rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Calendar className="w-3 h-3 text-brand" />
              Voltar ao mês atual
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
