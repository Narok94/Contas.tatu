import type { FinanceDataStore } from '../domain/financeRules';

export interface FinanceView { revision: string; month: string; state: FinanceDataStore }
export class ApiError extends Error {
  constructor(public status: number) {
    super(status === 409 ? 'Os dados mudaram em outra sessão. Confira o estado atualizado antes de tentar novamente.' :
      status === 403 ? 'Acesso disponível somente no ambiente local controlado.' :
      status === 422 || status === 400 ? 'Operação inválida. Confira os valores, o mês e as regras do histórico.' :
      'Não foi possível sincronizar os dados. Verifique a conexão e tente novamente.');
  }
}
export function createFinanceApi(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    try {
      const response = await fetcher(url, { method, credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new ApiError(response.status);
      return await response.json();
    } catch (error) { throw error instanceof ApiError ? error : new ApiError(0); }
  }
  return {
    read: (month: string) => request<FinanceView>(`/api/finance?month=${encodeURIComponent(month)}`),
    command: (action: string, month: string, expectedRevision: string, data: object) =>
      request('/api/finance/commands', 'POST', { action, month, expectedRevision, data }),
    category: (method: 'POST' | 'PATCH' | 'DELETE', id?: string, data?: object) =>
      request(`/api/categories${id ? '/' + encodeURIComponent(id) : ''}`, method, data),
    quote: (month: string, id: string) => request<{ revision: string; amount: number }>(`/api/finance?month=${encodeURIComponent(month)}&payoffId=${encodeURIComponent(id)}`),
  };
}

/** In-memory server snapshot only. No storage, demo bootstrap, optimistic writes or automatic retries. */
export class FinanceSession {
  snapshot: { month: string; view?: FinanceView; loading: boolean; busy: boolean; error: string; errorStatus?: number; ready: boolean };
  private listeners = new Set<() => void>();
  private sequence = 0;
  constructor(month: string, readonly api = createFinanceApi()) {
    this.snapshot = { month, loading: false, busy: false, error: '', ready: false };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private patch(patch: Partial<typeof this.snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()); }
  clearError = () => this.patch({ error: '' });
  async load(month = this.snapshot.month) {
    const seq = ++this.sequence;
    this.patch({ month, loading: true, ready: false });
    try {
      const view = await this.api.read(month);
      if (seq !== this.sequence) return false;
      if (view?.month !== month || typeof view.revision !== 'string' || !/^\d+$/.test(view.revision) || !view.state ||
        !['categories', 'creditCards', 'simpleAccounts', 'recurringDefinitions', 'recurringMonthlyRecords',
          'installmentPurchases', 'cardExpenses', 'cardMonthlyInvoices'].every(key => Array.isArray(view.state[key as keyof FinanceDataStore]))) throw new ApiError(0);
      this.patch({ view, ready: true, errorStatus: undefined }); return true;
    } catch (error) { if (seq === this.sequence) this.patch({ errorStatus: error instanceof ApiError ? error.status : 0, error: error instanceof ApiError ? error.message : new ApiError(0).message }); return false; }
    finally { if (seq === this.sequence) this.patch({ loading: false }); }
  }
  async mutate(operation: (revision: string) => Promise<unknown>) {
    if (this.snapshot.busy || !this.snapshot.ready || !this.snapshot.view) return false;
    this.patch({ busy: true, error: '' });
    try {
      await operation(this.snapshot.view.revision);
      // A failed refresh leaves writes disabled until a successful explicit reload.
      await this.load();
      // A confirmed write must close its form even if the subsequent read fails.
      return true;
    } catch (error) {
      const message = error instanceof ApiError && error.status !== 0 ? error.message :
        'Não foi possível confirmar a operação. Confira os dados atualizados antes de repetir: ela pode ter sido salva.';
      // Never retry a write: a network failure may have happened after commit.
      await this.load(); this.patch({ error: message }); return false;
    } finally { this.patch({ busy: false }); }
  }
  command = (action: string, data: object = {}, month = this.snapshot.month) =>
    this.mutate(revision => this.api.command(action, month, revision, data));
  category = (method: 'POST' | 'PATCH' | 'DELETE', id?: string, data?: object) =>
    this.mutate(() => this.api.category(method, id, data));
}
