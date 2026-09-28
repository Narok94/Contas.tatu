# Fundação controlada de persistência

`server/foundation.ts` usa exclusivamente `getNeonClient()`. Não carrega arquivos
de ambiente. O processo deve fornecer `CONTAS_TATU_DATABASE_URL`.

`createFoundation().initialize()` é uma operação administrativa explícita, sem
endpoint HTTP. Uma transação usa lock consultivo e IDs UUID fixos para criar o
household Contas Tatu, uma identidade técnica local, seu vínculo owner e as sete
categorias. `ON CONFLICT DO NOTHING` preserva IDs, edições e arquivamentos em
reexecuções. A identidade técnica não representa autenticação nem usuário real.
Não reaproveitar esse vínculo como autorização quando houver login.

O serviço expõe `getDefaultHousehold`, `listCategories`, `createCategory`,
`editCategory` e `archiveCategory`. Não aceita household fornecido pelo cliente.
Mutações bloqueiam o household e incrementam sua revisão na mesma transação.
Leituras usam transações read-only. Categorias arquivadas saem da listagem, mas
continuam persistidas; IDs e referências históricas não são apagados.

Rotas nativas Vercel preparadas:

- `GET /api/categories`: categorias ativas na ordem de cadastro.
- `POST /api/categories`: cria com `name`, `color` hexadecimal e `description` opcional.
- `PATCH /api/categories/:id`: substitui esses campos; omitir descrição a remove.
- `DELETE /api/categories/:id`: arquiva logicamente, sem DELETE SQL.

As rotas estão **bloqueadas na Vercel e em NODE_ENV=production**. Para uso local,
exigem `CONTAS_TATU_ENABLE_LOCAL_API=true`, conexão loopback, Host local, ausência
de Origin e de X-Forwarded-For. Não ofereça proxy público para esse serviço local.
Essa restrição temporária não é login/autorização e não é adequada a um produto
multiusuário. O frontend não utiliza essas rotas. Vercel dev/proxies que adicionem
X-Forwarded-For serão recusados por segurança.

Antes de liberar rotas remotas ou integrar contas/cartões/parcelamentos, definir
identidade autenticada, membership, autorização e guardas de mês fechado. O
arquivamento atual não desvincula referências financeiras: nenhuma dessas entidades
foi integrada nesta etapa. Não usar a identidade fixa como seleção multi-household.

Testes usam um double em memória da fronteira SQL e serviços simulados de HTTP;
não carregam `.env.local` nem dependem de Production. A validação administrativa
real separada executa somente bootstrap e leitura das quatro tabelas.
