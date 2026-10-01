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
  transação read-only. Confirma `neondb`, `finance_v2` e 22 tabelas (18 financeiras,
  três de autenticação e uma de chat); falhas
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
