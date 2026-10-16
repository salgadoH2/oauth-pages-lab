# AVALIACAO — GitHub Actions com IA

Laboratório: login em um site estático no Cloudflare Pages (Pages Functions + D1)
Projeto: `oauth-pages-lab` — <https://github.com/salgadoH2/oauth-pages-lab>
Site publicado: <https://oauth-pages-lab-9cz.pages.dev>
Autoria: João Vitor do Nascimento Martins, RA 2016108385

> Situação: Tarefas 1 e 2 concluídas com evidência. Tarefas 3, 4 e bônus
> **pendentes** — dependem dos segredos `COPILOT_PAT` e `CLOUDFLARE_API_TOKEN`.

## Preparação

- `migrations/0001_esquema_inicial.sql` com o esquema real do banco (tabelas
  `oauth_transactions` e `sessions` + índices), copiado da evidência
  `public/entrega1/04-d1-esquema.txt`.
- `wrangler.toml` com o binding do D1 exigido pela atividade:
  `binding = "DB"`, `database_name = "oauth-sessions-joao"`,
  `database_id = "3ee00e36-1b7d-4fb6-ab0b-1ea8ec12942a"`.
- Actions habilitado em Settings > Actions > General.
- Segredos: `CLOUDFLARE_ACCOUNT_ID` criado; `CLOUDFLARE_API_TOKEN` e
  `COPILOT_PAT` **ainda não criados**. Nenhum segredo está em arquivo
  versionado, log ou comentário (o próprio CI prova isso, abaixo).
- O repositório foi tornado **público**: o GitHub não oferece regra de branch
  (nem Rulesets) em repositório privado no plano Free, e a Tarefa 2 depende
  dela. O enunciado não restringe a visibilidade — as regras são trabalho em
  dupla, nenhum segredo exposto e evidência por link de execução.

## Tarefa 1 — CI a cada commit (2,5)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
Gatilhos: `push` em qualquer ramificação e `pull_request` para `main`.
Permissão mínima: `permissions: contents: read`.

Como as lacunas `???` do esqueleto foram preenchidas:

1. `sqlite3 teste.db < "$f"` dentro de `for f in migrations/*.sql`, com
   `set -euo pipefail` e `rm -f teste.db` antes do laço.
2. `npx --yes htmlhint "**/*.html"`.

**Execução verde (1ª):** <https://github.com/salgadoH2/oauth-pages-lab/actions/runs/38919297769>

**Execução vermelha (commit proposital):** <https://github.com/salgadoH2/oauth-pages-lab/actions/runs/38919673656>
Linha do log:

```
Parse error near line 2: near ";": syntax error
                                      error here ---^
##[error]Process completed with exit code 1.
```

**Execução verde após a correção:** <https://github.com/salgadoH2/oauth-pages-lab/actions/runs/38919846380>
Nela os três passos aparecem no log: o `git grep` sem achados, o SQLite listando
`oauth_transactions  sessions` e o htmlhint reportando
`Scanned 2 files, no errors found`.

**Por que testar a migração em SQLite antes de chegar ao D1:** porque o D1 roda
SQLite — aplicar as migrações num banco local pega erro de sintaxe e de schema
em segundos no CI, com o `sqlite3` apontando a linha exata, sem arriscar o banco
de produção.

**Achado do passo de segredos:** o `git grep` encontrava, dentro do próprio
`ci.yml`, o prefixo de segredo que a expressão procura (o scanner marcava a si
mesmo e toda execução ficaria vermelha). A varredura exclui apenas
`':(exclude).github/workflows/ci.yml'`, com justificativa em comentário. O teste
foi feito nos dois sentidos: plantando um valor no padrão de `client_secret`
num arquivo de teste o passo falha; sem ele, passa.

## Tarefa 2 — main protegida pelo status check (1,5)

Regra aplicada na `main`: pull request obrigatório + status check `verificar`
(`strict: true`) + administrador sem passe.

**PR bloqueado e depois liberado:** <https://github.com/salgadoH2/oauth-pages-lab/pull/1>
Com o erro da Tarefa 1 na ramificação, o CI ficou vermelho e a API do PR
reportou `mergeable_state: "blocked"`. Corrigido na mesma ramificação, o CI
ficou verde e o estado mudou para `"clean"` — merge liberado e executado
(commit `a8cf445`).

**Push direto na main recusado:**

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "verificar" is expected.
 ! [remote rejected] main -> main (protected branch hook declined)
```

## Tarefa 3 — revisão de PR por IA (3,5) — PENDENTE

Workflow: `.github/workflows/revisao-ia.yml` (ainda local, entra neste PR).
Falta: PR com SQL vulnerável, os dois comentários da IA, o teste de permissão
removendo `pull-requests: write` e a crítica à resposta da IA.

## Tarefa 4 — migrações D1 depois do merge (1,5) — PENDENTE

Workflow: [`.github/workflows/migrar.yml`](.github/workflows/migrar.yml), já na
`main`, com `paths: ['migrations/**']` e o passo de bônus do resumo no
`$GITHUB_STEP_SUMMARY`. Falta: o PR da migração `0002`, o merge disparando a
aplicação remota, a confirmação da coluna por `PRAGMA table_info(...)` e a prova
de que um merge sem tocar `migrations/` não executa o workflow.

## Perguntas

**1. Por que o `ci.yml` roda duas vezes quando você faz push numa ramificação
com PR aberto, e qual das duas execuções o status check da main considera?**
Porque o workflow tem dois gatilhos independentes: o `push` dispara no momento
do push na ramificação e o `pull_request` dispara quando o GitHub reabre o PR
com esse mesmo push, então o mesmo commit recebe duas execuções. O que a proteção
da main exige é o check `verificar` registrado no evento `pull_request`, porque é
ele que aparece na página do PR e alimenta o merge; a execução do `push` é
paralela e não é o que destrava o botão de merge.

**2. Por que um PR vindo de um fork não consegue usar `secrets.COPILOT_PAT`?
Qual ataque essa regra impede?**
No evento `pull_request` vindo de fork o GitHub entrega um `GITHUB_TOKEN`
somente-leitura e não injeta nenhum secret do repositório base (secrets chegam
apenas em `pull_request_target`). Isso impede o chamado "pwn request": alguém
abre um PR cujo workflow adulterado faz `run: echo ${{ secrets.COPILOT_PAT }}`
ou envia o secret para um servidor externo, já que o fork é controlado pelo
atacante.

**3. Por que o workflow da Tarefa 3 declara `permissions` em vez de usar as
permissões padrão do `GITHUB_TOKEN`?**
Por padrão o token é emitido com o maior conjunto de permissões permitido ao
repositório (escrita em `contents`, `packages` e mais), então qualquer vazamento
num passo `run` ou numa action de terceiros permitiria alterar código ou publicar
pacotes. Declarando `permissions: contents: read` e `pull-requests: write`, o
token só alcança o mínimo que o job precisa — e é justamente por isso que o item
3 da Tarefa 3 consegue provocar um erro de permissão ao remover
`pull-requests: write`.

**4. A revisão da IA pode substituir o status check da Tarefa 2? Justifique
com o que você observou no item 4 da Tarefa 3.** — PENDENTE (preencher com a
afirmação errada ou irrelevante observada na revisão).

## Referências

- actions/ai-inference: <https://github.com/actions/ai-inference>
- Copilot CLI em Actions: <https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions>
- Workflow syntax: <https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions>
- Cloudflare D1 migrations: <https://developers.cloudflare.com/d1/reference/migrations/>
