# Persistência financeira pela API — etapa final 3/3

## Execução controlada

- `npm run dev:isolated`: aplicação e API em `http://127.0.0.1:3100`, PostgreSQL PGlite **em memória**. Aplica a migration existente apenas nesse banco descartável e inicializa as sete categorias. Não lê `.env.local`, não acessa Neon e perde os dados ao encerrar. PGlite permanece dependência de desenvolvimento.
- `npm run dev:controlled`: mesma interface/API, usando exclusivamente `CONTAS_TATU_DATABASE_URL` de `.env.local` no servidor. Não cria schema, não inicializa fundação e não importa dados. As ações financeiras do usuário **persistem no Neon real**. Este modo não foi usado para os testes com escrita.
- Ambos escutam exclusivamente em loopback. `CONTAS_TATU_LOCAL_PORT` permite escolher outra porta. Não executar por proxy/túnel público.
- `npm run dev` é o Vite isolado, sem os handlers financeiros. Para usar a API completa, usar um dos dois comandos acima.
- Rollback legado: somente em desenvolvimento, iniciar Vite com `VITE_FINANCE_MODE=local`. Esse modo usa a implementação anterior de localStorage, sem API. Não há fallback automático. O bundle de produção exclui o provider legado e os dados demo.

## Arquitetura

`FinanceProvider` seleciona o provider de API por padrão. `NeonFinanceProvider` adapta as ações existentes para `FinanceSession` / `createFinanceApi`, que fazem requisições de mesma origem a `/api`. Os handlers mantêm a camada server-side e `getNeonClient()` como acesso exclusivo ao Neon. O frontend não importa servidor, driver, SQL ou configuração de conexão.

O estado financeiro no navegador é uma projeção transitória da resposta do servidor, sem persistência local e sem alterações otimistas. O servidor valida comandos e controla as revisões. Histórico e resumo anual continuam usando os mesmos cálculos puros sobre a projeção carregada da API.

| Operação da interface | API |
| --- | --- |
| Mês, contas, histórico e resumos | `GET /api/finance?month=YYYY-MM` |
| Conta simples | `simple.create`, `simple.edit`, `simple.archive` |
| Conta recorrente / valor mensal | `recurring.create`, `recurring.edit`, `recurring.archive` |
| Cartão | `card.create`, `card.edit`, `card.archive` |
| Compra interna | `expense.create`, `expense.edit`, `expense.archive` |
| Pagamento total/parcial/reversão | `payment` |
| Parcelamento | `installment.create`, `installment.change`, `installment.correct` |
| Cancelar futuro | `installment.cancel` a partir do mês selecionado |
| Quitação | cotação GET com `payoffId`, seguida de `installment.payoff` com revisão validada |
| Fechar/reabrir | `month.close`, `month.reopen` |
| Categorias | POST/PATCH/DELETE lógico em `/api/categories` |

Os comandos financeiros são enviados por POST a `/api/finance/commands` com `expectedRevision`. Categorias seguem o contrato próprio existente e a recarga obtém a nova revisão do household. Nenhuma API aceita household escolhido pelo navegador.

## Estado assíncrono

- Carregamento inicial e mudança de mês mostram estado de carregamento, sem exibir contas de outro mês. Banco vazio utiliza a UI vazia existente.
- Após mutações, recarrega a projeção preservando o mês; atualização do mesmo mês mantém a tela e os filtros.
- Um bloqueio síncrono na sessão impede comandos simultâneos, inclusive cliques repetidos antes de React renderizar.
- HTTP 409 recarrega o estado, preserva o formulário e exige nova decisão do usuário; nunca reenvia automaticamente.
- Erros usam mensagens locais sanitizadas, sem mostrar corpo bruto, stack ou SQL. Existe recuperação explícita por “Atualizar”/“Tentar novamente”.
- Falha de rede em uma escrita pode ocorrer após commit: o aviso pede conferir o estado antes de repetir. Uma escrita confirmada fecha seu formulário mesmo se a recarga falhar; novas escritas ficam bloqueadas até recarregar com sucesso.
- Respostas de navegação fora de ordem são descartadas. Não há fila de comandos offline.

## Dados locais e segurança

`organizacao_financeira_store_v1` continua implementada somente em `src/services/financeStorage.ts`, utilizada pelo provider legado explícito e por seus testes. No modo API, não é lida, sobrescrita, removida ou enviada. Nenhum bootstrap/demo é disparado pelo frontend. A restauração de demonstração fica indisponível no modo API.

A fronteira temporária continua bloqueando todas as requisições financeiras/categorias em Vercel e `NODE_ENV=production`, mesmo com a flag local habilitada. Exige flag explícita, endereço remoto loopback, Host local, ausência de cabeçalhos de encaminhamento e Origin ausente ou exatamente igual à origem HTTP local. Requisições cross-site são negadas. Isto **não é autenticação definitiva**.

Vite bloqueia importação e acesso estático a `server/`, `api/`, `scripts/`, arquivos de ambiente e chaves. O runner desabilita o carregamento de arquivos de ambiente pelo Vite; no modo Neon, somente a variável dedicada é carregada programaticamente para o processo servidor. Nenhum valor é registrado ou retornado.

Não houve mudança em migrations, schema, `neon_auth` ou dados do Neon real nesta etapa. Nenhum commit, push ou deploy faz parte dela.

## Validação

- `npm run lint` inclui frontend, servidor e runner controlado.
- `npm run build` gera somente a aplicação API, sem provider/demo legado.
- `npm test` inclui a suíte anterior e `tests/financeClient.test.ts`: carregamento vazio, ausência de storage/demo, concorrência, erros, duplicação, recarga, operações e projeções com PGlite.
- `tests/browser-validation.cjs` e `tests/accounts-browser-validation.cjs` continuam validando a UI/regressões no rollback explícito, em perfis descartáveis e quatro resoluções desktop.
- `tests/neon-browser-validation.cjs` testa UI → cliente → HTTP → serviços → SQL em PGlite. Exige o marcador do runner isolado antes de qualquer escrita e banco financeiro inicialmente vazio. Executar contra uma instância nova de `npm run dev:isolated`, passando o caminho de Playwright se não estiver disponível localmente. Nenhum fixture desse teste vai para Neon.

## Limites deliberados

A integração mínima é local/controlada. Publicação com escrita remota depende de autenticação e autorização definitiva, escopo de household seguro e remoção planejada da proteção temporária. Migração de localStorage exige ferramenta separada, consentimento, prévia e estratégia de deduplicação/rollback. Essas tarefas ficam para depois do mobile. Não há sincronização automática com dados antigos.

## Resultado da verificação desta etapa

98/98 testes automatizados aprovados; lint e build aprovados. As três suítes de navegador passaram: 7 grupos de histórico, 5 grupos de contas (ambas em quatro resoluções desktop) e 8 grupos da nova integração HTTP/PGlite. A varredura do bundle não encontrou URL PostgreSQL, variável de conexão, driver Neon, schema SQL, chave de localStorage financeiro ou chunk do provider legado.

Arquivos de ambiente e dist continuam ignorados. A migration está inalterada. Nenhum arquivo foi staged; não houve commit, push, deploy ou escrita no Neon real. `.gitignore` e `HISTORY-SIMPLIFICATION-REVIEW.md` tinham alterações preexistentes e foram preservados.

### Arquivos desta implementação

- `docs/FRONTEND-PERSISTENCE.md`
- `scripts/controlled-dev.ts`
- `src/components/InstallmentLifecycle.tsx`
- `src/context/LocalFinanceProvider.tsx`
- `src/context/NeonFinanceProvider.tsx`
- `src/context/financeContextState.ts`
- `src/services/financeApi.ts`
- `tests/financeClient.test.ts`
- `tests/neon-browser-validation.cjs`
- `README.md`
- `docs/CONTROLLED-FOUNDATION.md`
- `docs/FINANCIAL-PERSISTENCE.md`
- `package.json`
- `server/category-api.ts`
- `src/App.tsx`
- `src/components/AccountModal.tsx`
- `src/components/CardPurchaseModal.tsx`
- `src/components/PaymentDialog.tsx`
- `src/components/SettingsModal.tsx`
- `src/context/FinanceContext.tsx`
- `src/pages/AccountsPage.tsx`
- `src/pages/HistoryPage.tsx`
- `tsconfig.server.json`
- `vite.config.ts`
