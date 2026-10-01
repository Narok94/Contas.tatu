# Base administrativa de backup e restauração

Não executa SQL, migrations, limpeza, recriação de tabelas ou reset. Não há
tarefa automática nem integração no fluxo financeiro.
Nada é executado ao importar o módulo, iniciar o app ou publicar o commit.

Configure apenas no ambiente do operador ou servidor Vercel `CONTAS_TATU_NEON_API_KEY`,
`CONTAS_TATU_NEON_PROJECT_ID=small-dream-79132114` e
`CONTAS_TATU_NEON_BRANCH_ID=br-purple-tree-b7rcasev`. A chave administrativa deve
ter acesso somente ao projeto necessário; não pertence ao frontend nem ao Git.
A URL PostgreSQL não autoriza a API administrativa. O script não lê `.env` sozinho.

Configurações oferece somente criar e listar pontos seguros. `/api/backup`
exige sessão válida e mesma origem para escrita; disponibilidade e andamento
também exigem autenticação. Sem configuração administrativa, as duas ações
ficam bloqueadas com mensagem clara. Erros são sanitizados. Não existe rota
HTTP de restauração; a confirmação extra no terminal permanece obrigatória.
Criação não tem retry automático e só informa conclusão após operações finalizadas.

Com o runtime/dependências instalados:

```text
npx tsx scripts/neon-backup.ts list
npx tsx scripts/neon-backup.ts create antes-da-alteracao
npx tsx scripts/neon-backup.ts operation <operation-id>
npx tsx scripts/neon-backup.ts restore <snapshot-id> recovery-conferencia
```

Criação usa snapshot nativo da branch inteira, incluindo todos os schemas,
dados financeiros, chat e autenticação. Não seleciona nem transforma registros.
A listagem filtra a branch de produção e mostra datas/expiração. Respostas de
criação e restauração incluem operações assíncronas: aceitação não significa
backup/restauração concluídos. Consultar `operation` até `finished`; `failed`
exige diagnóstico. Disponibilidade, retenção e limites dependem do Neon/plano.
Não há exclusão de snapshots nem alteração automática de retenção.

Restaurar exige terminal interativo e a frase exata mostrada no plano. O plano
fica em memória durante cinco minutos, vinculado ao snapshot/projeto/nome e é
consumido antes do envio. Confirmação ausente, incorreta, expirada, reutilizada
ou simultânea não dispara outra restauração. A origem e o snapshot são
revalidados; snapshot ausente/expirado/outra branch falha fechado.

O destino é sempre uma **nova branch `recovery-*`**, com `finalize_restore:false`.
Não substitui produção, move computes, troca URLs do app nem promove a cópia.
Os dados atuais ficam preservados na branch original. Não existe método de
finalização/cutover nesta base; uma futura promoção precisará de outra revisão
e confirmação. A cópia contém também dados de autenticação: validar mantendo-a
isolada; não conectar automaticamente o app público a ela.

HTTP tem timeout e rejeita redirecionamentos. Falhas não exibem corpo da API,
tokens, URLs de conexão ou stack. Não há retry automático de operações de escrita:
se a resposta se perder, consultar Neon antes de emitir um novo comando.

Esta entrega é somente implementação e testes com API simulada: não criou
snapshots, branches, chaves nem executou restauração no Neon real.

Contratos oficiais consultados em 01/10/2026:
[criar](https://api-docs.neon.tech/reference/createsnapshot),
[listar](https://api-docs.neon.tech/reference/listsnapshots),
[restaurar](https://api-docs.neon.tech/reference/restoresnapshot) e
[OpenAPI](https://neon.com/api_spec/release/v2.json).
