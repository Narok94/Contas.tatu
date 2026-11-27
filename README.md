# Contas.tatu

## Arquitetura

O frontend React/TypeScript usa a API como fonte de persistência financeira no
ambiente autenticado. Dados locais antigos não são importados ou apagados.

Arquitetura: **React/Vite → API server-side → Neon**. As rotas financeiras
exigem sessão válida de Henrique ou Jéssica, ambos na mesma casa. Escrita anônima
continua bloqueada. O acesso fechado está descrito em [AUTHENTICATION.md](docs/AUTHENTICATION.md).
Na Vercel, `dist/` contém o frontend e `api/health.ts` é executado sob demanda
no runtime Node.js em `/api/health`. Não há processo Express nem `listen()`.
O health check é público: GET retorna `200 {"status":"ok"}`, HEAD retorna 200
sem corpo e outros métodos retornam 405. Não lê secrets, não consulta banco e
não informa versões, configuração ou detalhes internos. Não verifica o Neon.

## Backend e secrets

- `api/`: pontos de entrada HTTP para `/api/health` e `/api/db-health`.
  O diagnóstico do banco aceita GET/HEAD e consulta somente metadados em uma
  transação read-only. Confirma `neondb`, `finance_v2` e 25 tabelas (18 financeiras,
  três de autenticação, uma de chat, pagamentos mobile, autorias e comprovantes Seven); falhas
  retornam HTTP 500 com mensagem genérica, sem detalhes de conexão.
- `server/neon.ts`: fonte única do cliente HTTP Neon server-side. `getNeonClient()`
  valida a configuração e cria/reutiliza o cliente por instância do runtime.
  Importar o módulo não lê secrets; criar o cliente não executa consultas.
  `/api/db-health` utiliza esse cliente; `/api/health` permanece independente.
- `tsconfig.server.json`: valida o backend separadamente, com tipos Node.js.
- O Vite rejeita imports de `api/` e `server/` e bloqueia o acesso direto a essas
  pastas pelo servidor de desenvolvimento. O frontend não importa esses módulos.
- Configure exclusivamente `CONTAS_TATU_DATABASE_URL` no ambiente server-side
  das Vercel Functions. Não há fallback para variáveis de outras integrações.
  Localmente, o processo Node deve carregar `.env.local` (por exemplo, com
  `node --env-file=.env.local` ao executar um script server-side). O módulo
  lê `process.env` sob demanda e não abre arquivos de ambiente.
- Configure `CONTAS_TATU_APP_ORIGIN` com a origem HTTPS exata de Production para
  validar as operações autenticadas. Login e sessão não usam localStorage.
- Nunca use prefixo `VITE_` para secrets: esse prefixo disponibiliza valores ao
  navegador. Não adicione secrets ao `define` do Vite, respostas HTTP ou logs.
  O cliente fica restrito ao servidor; não retorne erros brutos do driver em APIs.
- Arquivos `.env*` (exceto o exemplo) e `.vercel/` são ignorados pelo Git.
  Lint, build, testes e `/api/health` não precisam de credenciais do banco.
  `/api/db-health` exige a variável configurada no ambiente server-side.

## Desenvolvimento e validação

Após instalar as dependências com `npm install`:

```sh
npm run dev:isolated   # UI + API + PGlite em memória, porta 3100
npm run dev:controlled # UI + API + Neon real; ações persistem no banco
npm run dev           # somente Vite, sem handlers financeiros
npm run build
npm run lint   # TypeScript do frontend/configuração e backend
```

Para testar o runtime server-side, com a CLI Vercel instalada e configurada:
execute `npm run dev:api` (equivale a `vercel dev`) e use a URL/porta exibida:

```sh
curl -i http://localhost:3000/api/health
curl -I http://localhost:3000/api/health
curl -i -X POST http://localhost:3000/api/health
```

Não execute o Vite separadamente na mesma porta. `npm run dev` e `vite preview`
sozinhos não executam Vercel Functions. A CLI pode solicitar vinculação a um
projeto Vercel; não é necessário configurar banco. Não baixe secrets de produção
para testar o health check.

A integração financeira está documentada em [FRONTEND-PERSISTENCE.md](docs/FRONTEND-PERSISTENCE.md).
O modo controlado usa apenas a variável dedicada de `.env.local` no servidor.
Não executa migration nem importa dados locais/demo. O modo isolado aplica a
migration existente somente ao PGlite em memória e é o destino dos testes E2E.
O teste focado `tests/auth-browser.cjs` inicia esse ambiente com uma senha
aleatória transitória e as duas contas fechadas; nenhuma senha entra no código.
O rollback de localStorage exige `VITE_FINANCE_MODE=local` em desenvolvimento;
não existe fallback automático nem provider legado no bundle de produção.

Referência: https://vercel.com/docs/functions/runtimes/node-js

## Autoria e ordenação dos lançamentos

Antes de publicar a versão que exibe autores, aplique
`database/migrations/005_entry_origins.sql` ao banco já provisionado.
Essa migração é aditiva e idempotente; não altera valores nem pagamentos.
O ambiente `dev:isolated` e os testes SQL já a aplicam ao banco em memória.

Aplicada em 25/11/2026 ao `neondb` da branch de produção
`br-purple-tree-b7rcasev` (projeto `ContasTatu`), após validação em branch
temporária. Foram recuperadas 23 autorias de parcelamentos; as contagens de
contas, compras, parcelamentos e pagamentos permaneceram inalteradas.

Novas contas e compras guardam o autor autenticado na mesma transação financeira,
independentemente de serem adicionadas pelo desktop, cadastro manual ou fluxo de
compra mobile. Edições, pagamentos e limpeza da conversa preservam o autor original.
A migração recupera autores antigos somente das versões iniciais de parcelamentos;
registros sem vínculo confiável mostram “Autor não registrado”.

Clique no nome de uma conta ou compra da fatura para consultar autor e data de
cadastro. Ambas as telas oferecem ordenação por cadastro mais recente ou mais
antigo e filtro por autor. A fatura também combina descrição, categoria, tipo e
valor; a data do cadastro não substitui a data da compra.


## Comprovante Seven

Área privada de Henrique no menu mobile e na navegação desktop. A API valida
sessão, origem, ID fixo do usuário e casa; nomes enviados pelo cliente não
concedem acesso. Jéssica não vê o menu e recebe 403 em todas as operações Seven.

A migração aditiva `database/migrations/006_seven_receipts.sql` cria uma tabela
independente, sem modificar saldos, pagamentos, revisões ou lançamentos existentes.
Aplicada em 26/11/2026 ao `neondb` de produção `br-purple-tree-b7rcasev`, após teste
na branch `codex/seven-validation-20261126` (`br-plain-wave-b7ow5ro2`), mantida para
revisão. As contagens permaneceram: 4 contas avulsas, 48 compras de cartão,
49 parcelamentos e 3 pagamentos mobile. A área começa vazia.

Cada registro exige descrição, cliente/local, data, valor positivo e 1–10 prints
PNG/JPEG/WebP, com até 1 MB por imagem e 3 MB de dados codificados no conjunto.
Os anexos ficam incorporados ao registro privado no banco, salvos/substituídos/
excluídos atomicamente. A listagem retorna apenas metadados; os prints são lidos
sob demanda por uma API autenticada, sem URLs públicas. Não há novas dependências.

É possível vincular uma conta avulsa do mês. O vínculo preenche descrição e valor
como referência e não cria outra conta financeira; alterações posteriores na
conta não mudam o registro de trabalho. Uma conta só pode ter um registro Seven.
Duplicatas de data/descrição/local/valor são rejeitadas, assim como gravações com
versão desatualizada. Exclusão de Seven preserva a conta vinculada.

O relatório mensal baixa um HTML com detalhes, total em centavos e todas as
imagens incorporadas. Pode ser aberto offline e impresso/salvo como PDF pelo
navegador. O arquivo contém os comprovantes privados de Henrique.

Validação: `npm run lint`, `npm test`, `npm run build` e
`node tests/seven-browser.cjs <caminho-do-playwright>` (Playwright externo já
instalado, Edge headless, banco PGlite isolado, credenciais transitórias).

## Limite de funções na Vercel

O projeto mantém 12 funções em `api/`, sem mudança de plano. A função dinâmica
`api/auth/[action].ts` atende os endereços existentes `/api/auth/login` e
`/api/auth/logout`; `/api/auth/session` continua separado. O roteador aceita
somente esses dois caminhos e reaproveita os handlers de autenticação com as
mesmas validações de método, origem e cookies. Parâmetros de consulta não mudam
a ação executada. O ambiente isolado usa esse mesmo roteador.

`npm run build` verifica a quantidade de funções antes de compilar o frontend e
falha se houver mais de 12. Novas rotas devem ser agrupadas em funções existentes
quando necessário. O sucesso do build local não confirma a publicação: o deploy
na Vercel precisa terminar em `Ready`.
