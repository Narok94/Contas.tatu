import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Tag, RefreshCw, Check } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Category } from '../types/finance';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_PRESETS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#db2777', // pink
  '#7c3aed', // purple
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#475569', // slate
  '#16a34a', // green
  '#ea580c', // orange
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    resetData,
  } = useFinance();

  const [isCreating, setIsCreating] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [description, setDescription] = useState('');

  // Confirmações
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setEditingCategory(null);
    setName('');
    setColor(COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]);
    setDescription('');
    setIsCreating(true);
  };

  const handleStartEdit = (cat: Category) => {
    setIsCreating(false);
    setEditingCategory(cat);
    setName(cat.name);
    setColor(cat.color);
    setDescription(cat.description || '');
  };

  const handleCancelForm = () => {
    setIsCreating(false);
    setEditingCategory(null);
    setName('');
    setDescription('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingCategory) {
      updateCategory({
        ...editingCategory,
        name: name.trim(),
        color,
        description: description.trim() || undefined,
      });
      setEditingCategory(null);
    } else {
      addCategory(name.trim(), color, description.trim() || undefined);
      setIsCreating(false);
    }
    setName('');
    setDescription('');
  };

  const handleConfirmDelete = () => {
    if (categoryToDelete) {
      deleteCategory(categoryToDelete.id);
      setCategoryToDelete(null);
    }
  };

  const handleConfirmReset = () => {
    resetData();
    setShowResetConfirm(false);
    onClose();
  };

  return (
    <>
      <div
        id="settings-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4"
      >
        <div
          id="settings-modal-box"
          role="dialog"
          aria-modal="true"
          className="bg-white border border-stone-200 rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-stone-100 text-stone-700">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-stone-900 tracking-tight">
                  Configurações
                </h2>
                <p className="text-xs text-stone-500">
                  Gerenciamento de categorias e classificações
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 p-1 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6">
            {/* Seção de Categorias */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    Categorias / Tags
                  </h3>
                  <p className="text-xs text-stone-500">
                    Personalize como as despesas do casal são classificadas
                  </p>
                </div>
                {!isCreating && !editingCategory && (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Categoria
                  </button>
                )}
              </div>

              {/* Form de Criar/Editar Categoria */}
              {(isCreating || editingCategory) && (
                <form
                  onSubmit={handleSave}
                  className="mb-4 p-4 rounded-lg bg-stone-50 border border-stone-200 space-y-3"
                >
                  <div className="text-xs font-semibold text-stone-800">
                    {editingCategory ? 'Editar Categoria' : 'Cadastrar Nova Categoria'}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Nome da Categoria
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Casa, Mercado, Manoela, Antônio, Lazer"
                      className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>

                  {/* Cores */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Cor de Identificação
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setColor(preset)}
                          className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                          style={{ backgroundColor: preset }}
                        >
                          {color === preset && (
                            <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelForm}
                      className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200/60 rounded-md transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-md shadow-xs transition-colors cursor-pointer"
                    >
                      {editingCategory ? 'Salvar' : 'Criar Categoria'}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Categorias cadastradas */}
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-stone-200/80 bg-white hover:bg-stone-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm font-medium text-stone-800">
                        {cat.name}
                      </span>
                      {cat.description && (
                        <span className="text-xs text-stone-400 font-normal truncate max-w-[180px]">
                          ({cat.description})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(cat)}
                        className="p-1.5 text-stone-400 hover:text-stone-800 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
                        title="Editar categoria"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryToDelete(cat)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Separador e Opção de Resetar Demonstração */}
            <div className="pt-4 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-stone-700">
                    Dados de Demonstração
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Restaura as contas simuladas originais (Setembro 2026)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 hover:bg-stone-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Restaurar Exemplo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmação de exclusão da categoria */}
      <ConfirmDialog
        isOpen={Boolean(categoryToDelete)}
        title="Excluir Categoria"
        message="Tem certeza de que deseja excluir esta categoria? As contas vinculadas a ela passarão a ficar sem categoria."
        itemName={categoryToDelete?.name}
        confirmLabel="Sim, excluir"
        onConfirm={handleConfirmDelete}
        onCancel={() => setCategoryToDelete(null)}
      />

      {/* Confirmação de reset de dados */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Restaurar Dados Originais"
        message="Deseja recarregar o conjunto de contas e parcelas de demonstração do casal?"
        confirmLabel="Restaurar dados"
        isDestructive={false}
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  );
};
