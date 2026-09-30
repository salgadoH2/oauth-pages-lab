# 07 - Testes de falha executados

Laboratorio: login em um site estatico no Cloudflare Pages
Implantacao testada: `https://oauth-pages-lab-9cz.pages.dev` (producao, branch `main`)
Data da execucao: 29/09/2026 (21:46 UTC-3 / 00:46 UTC)
Metodo: requisicoes HTTP reais contra a implantacao de producao (DevTools/curl), sem registro
de valores transitorios. Nenhum cookie, state, nonce, code_challenge, token ou segredo consta
neste documento.

---

## Caso 1: retorno sem cookie temporario

- **Preparacao:** iniciar `/oauth/login/google` e guardar o cookie `__Host-oauth-tx` em um
  frasco separado; depois repetir o pedido de retorno **sem** enviar nenhum cookie
  (equivalente a concluir o login em uma janela privativa diferente da que iniciou).
- **Pedido enviado:** `GET /oauth/callback/google?code=...&state=...` (valores transitorios
  nao registrados) sem o cabecalho Cookie.
- **Resultado esperado:** a rota de retorno recusa a resposta e nao cria sessao.
- **Resultado observado:** `HTTP/1.1 401 Unauthorized` — corpo `Missing OAuth transaction`,
  `Cache-Control: no-store`. Nenhuma sessao foi criada.

## Caso 2: state alterado

- **Preparacao:** iniciar um novo login em `/oauth/login/google` (com o cookie temporario
  real no frasco), capturar o `state` da URL de autorizacao e alterar um unico caractere
  antes do retorno.
- **Pedido enviado:** `GET /oauth/callback/google?code=...&state=<state com 1 caractere
  alterado>` com o cookie `__Host-oauth-tx` correto.
- **Resultado esperado:** a rota de retorno recusa a resposta antes de trocar o codigo.
- **Resultado observado:** `HTTP/1.1 401 Unauthorized` — corpo `Invalid OAuth state`,
  `Cache-Control: no-store`. A transacao foi apagada do D1 e o codigo nao foi trocado.

## Caso 3: reutilizacao da transacao

- **Preparacao:** com a mesma transacao do Caso 2 ja consumida (a Function apaga a linha do
  D1 antes de concluir o fluxo), repetir o mesmo pedido de retorno; em outra rodada, repetir
  tambem um pedido identico logo apos um retorno com codigo invalido.
- **Pedido enviado:** repeticao identica de `GET /oauth/callback/google?...` com o mesmo
  cookie `__Host-oauth-tx`.
- **Resultado esperado:** a transacao ja removida faz a repeticao falhar.
- **Resultado observado:** `HTTP/1.1 401 Unauthorized` — corpo `Invalid or expired OAuth
  transaction`, `Cache-Control: no-store`, tanto apos consumo com sucesso logico quanto na
  repeticao identica.

## Caso 4: sessao expirada

- **Preparacao:** criar uma sessao de teste pelo caminho feliz e, no console D1, executar
  `UPDATE sessions SET expires_at = 0;`.
- **Pedido enviado:** `GET /api/me` com o cookie `__Host-session` da sessao alterada.
- **Resultado esperado:** `/api/me` responde 401.
- **Resultado observado:** `HTTP/1.1 401 Unauthorized`, `Cache-Control: no-store`. O banco
  pertence apenas ao laboratorio; a alteracao encerrou todas as sessoes da equipe no
  ambiente de teste, como previsto no roteiro.

## Caso 5: origem invalida na saida

- **Preparacao:** com a base `https://oauth-pages-lab-9cz.pages.dev`, enviar o POST de
  logout com `Origin` de outra origem (`https://example.com`), simulando a chamada
  `fetch(URL_BASE/oauth/logout, { method: "POST", credentials: "include" })` executada a
  partir de uma pagina estranha.
- **Pedido enviado:** `POST /oauth/logout` com cabecalho `Origin: https://example.com`.
- **Resultado esperado:** a rota recusa a operacao e a sessao original permanece valida.
- **Resultado observado:** `HTTP/1.1 403 Forbidden` — corpo `Forbidden`,
  `Cache-Control: no-store`. Nenhum `Set-Cookie` foi devolvido e a sessao original
  permaneceu valida. (Variacao: POST sem `Origin` tambem resulta em 403.)

## Caso 6: reutilizacao do cookie revogado

- **Preparacao:** copiar temporariamente o valor de um cookie `__Host-session` pelas
  ferramentas de desenvolvimento, executar o logout (a linha correspondente e removida do
  D1 e o cookie e expirado) e tentar restaurar o mesmo valor antes de consultar `/api/me`.
- **Pedido enviado:** `GET /api/me` com um valor de `__Host-session` que nao corresponde a
  nenhuma linha valida do D1.
- **Resultado observado:** `HTTP/1.1 401 Unauthorized`, `Cache-Control: no-store`. Como a
  linha foi removida do D1, o cookie revogado nao restaura a sessao. A copia do valor foi
  descartada imediatamente e nao consta nesta evidencia.

---

## Verificacoes adicionais executadas

- Provedor nao suportado: `GET /oauth/login/twitter` -> `HTTP/1.1 404 Not Found`, sem
  revelar detalhes internos.
- Conteudo estatico permanece publico: `GET /` -> `HTTP/1.1 200 OK`
  (`text/html; charset=utf-8`).
- `GET /api/health` -> `HTTP/1.1 200 OK`, `Cache-Control: no-store`.
- `GET /api/me` sem sessao -> `HTTP/1.1 401 Unauthorized`, `Cache-Control: no-store`.
- `POST /oauth/logout` com `Origin` correta -> `HTTP/1.1 303 See Other`,
  `Location: https://oauth-pages-lab-9cz.pages.dev`,
  `Set-Cookie: __Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  `Cache-Control: no-store`.

Todos os resultados observados coincidem com os resultados esperados do roteiro.
