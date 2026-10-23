# Quem Paga O Quê? — plano de implementação

Aprovado em 22/10/2026. Regras em `docs/spec/`, visual em `reference/`, decisões pendentes em `docs/spec/pontos-em-aberto.md`.

Decisões que moldam o plano:
- **Centavos** vão 1 a 1 por ordem de entrada no split (`joinOrder`).
- **Partes pagas:** `paid[pessoa]` guarda os centavos pagos.
- **Stack:** React + TS + Vite no Pages; Firebase em **us-east1**.
- **UX otimista em toda ação** para compensar a latência: aplica na hora, assume sucesso e reverte com toast de erro só se o servidor recusar.

## 1. Stack e por quê

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Monorepo | npm workspaces: `packages/calc`, `apps/web`, `functions` | O motor de cálculo é importado pelo app **e** pelas Functions |
| Front | React 19 + TS + Vite, SPA estática | O Pages só serve estático; Vite gera um build simples |
| Rotas | React Router com **HashRouter** (`/#/s/:splitId`, `/#/convite/:code`) | O Pages não tem fallback de SPA: sem `#`, link de convite dá 404 |
| Estado do servidor | SDK do Firestore + listeners `onSnapshot` + cache persistente (IndexedDB) | A escrita local instantânea já dá o otimismo do pagamento |
| Otimismo nas Functions | Primitiva `useOptimisticAction`: aplica patch local → chama callable → reverte em erro | Ações que passam por Function não têm o cache do Firestore |
| Estilo | CSS Modules + **um único** `apps/web/src/theme/tokens.css` com as variáveis da Folha de estilo (`.theme-light` / `.theme-dark` de `reference/design/Main.dc.html`) | Regra "cor só por token"; a paleta ainda não está fechada, então trocar uma cor tem que ser mexer em um só lugar (ver Fase 2) |
| i18n | `i18next` + `react-i18next`, `pt-BR.json` padrão e `en.json` completo; `Intl.NumberFormat` com BRL nos dois idiomas | PT/EN completos; R$ sempre |
| Auth | Firebase Auth: anônimo, Google por **popup**, e-mail/senha, custom token (link de recuperação) | Ver `docs/spec/03-contas-e-convidados.md` |
| Back-end | Firestore, Cloud Functions v2 (Node 22, TS) e Storage em `us-east1` | Functions e Storage **exigem Blaze**: cadastrar cartão com alerta de orçamento |
| E-mail | Function chamando um provedor transacional via secret (ver ponto em aberto 10) | Notificação por e-mail |
| Testes | Vitest (calc, componentes), `@firebase/rules-unit-testing` (regras), Functions no emulador, Playwright (e2e + screenshots 390/1440) | Cada fase tem uma checagem que o agente roda |
| CI/CD | GitHub Actions: typecheck + testes + rules + e2e no emulador; deploy de `apps/web/dist` no Pages na `main`; deploy Firebase manual no staging | Produção nunca é tocada pelo agente |
| Projetos Firebase | `.firebaserc` com aliases `staging` (padrão) e `prod` | O agente usa emuladores e staging |

## 2. Modelo de dados (Firestore)

### Guardado

- `users/{uid}`: `displayName`, `email?`, `photoPath?`, `prefs {inapp, email, selfName, askProof, theme, lang}`, `createdAt`. O campo `push` não existe na v1, que só tem web.
- `splits/{splitId}`:
  - `name, emoji, photoPath?, status: open|done, doneAt?, code, createdAt`
  - `members: { [memberId]: { name, uid|null, joinOrder, joinedAt, isNew? } }`
  - `uids: string[]` (UIDs vinculados, usado pelas regras), `adminUids: string[]`, `nextJoinOrder`
  - Participante = `memberId` (estável); o vínculo com o usuário é `members[x].uid`. Quem cria entra já vinculado ao próprio uid.
- `splits/{id}/expenses/{expId}`:
  - `name, amount, payer, members[], mode, w, items[], rest[], restMode, restW, date, tags[], note, longDesc, receiptPath?, author, version, createdAt, updatedAt`
  - `paid: {[memberId]: cents}`, `proof: {[memberId]: path}`, `pendConf: {[memberId]: true}`
  - Todos os ids são `memberId`.
- `splits/{id}/expenses/{expId}/history/{hId}`: `{kind, by, at, from?, to?, memberId?}`. Só Functions escrevem aqui.
- `splits/{id}/payments/{pid}`: `from, to, amount, when, proofPath?, by`.
- `inviteCodes/{code}` → `{splitId}`. Só Functions leem.
- `recoveryTokens/{sha256(token)}` → `{uid, createdAt, revokedAt?}`. Só Functions acessam.
- `users/{uid}/notifications/{nid}`: `kind, splitId, expId?, paymentId?, fromMember, amount, hasProof, when, read, status: new|confirmed|disputed`. Só Functions criam.

### Sempre calculado, nunca guardado

Parte de cada um (`shares`), `P`, `M`, `net`, `sug`, total da home e "1 pagamento p/ conferir".

### Valor pago

A parte quitada é `min(paid[x], share[x])`. Se `paid[x] < share[x]`, a diferença é pendente e entra em `P[x][payer]`. Se `paid[x] > share[x]`, o excedente vira crédito: entra em `P[payer][x]`.

## 3. Permissões: onde e como testar

| Ação | Garantia | Teste |
| --- | --- | --- |
| Ler split e subcoleções | Rules: `auth.uid in split.uids` | Membro lê, estranho não |
| Lançar despesa | Rules: membro, split `open`, `author` = meu memberId, validação de forma (inteiros ≥ 0, `version == 1`) | Lança com e sem permissão; split finalizado bloqueia |
| Editar/excluir despesa | Rules: `author` ou admin, `open`, `version` incrementa em 1. Histórico por trigger | Não-autor nega; versão errada nega |
| Marcar parte paga | Rules: `diff().affectedKeys()` ⊆ `{paid, proof, pendConf}` e só na chave `x` onde caller = x, payer ou admin; o payer nunca tem chave | Matriz de quem pode marcar a parte de quem |
| Confirmar / "Não recebi" | Rules: só payer ou admin mexe em `pendConf`; "Não recebi" apaga `paid[x]` + `proof[x]` | Membro comum não confirma pelo outro |
| Registrar acerto | Rules: `from` ou `to` = caller, ou admin; `open` | Terceiro não-admin nega |
| Desfazer acerto | Rules (delete): `from`/`to` ou admin; `open` | Idem |
| Anexar comprovante depois | Rules: campo antes ausente + Storage rules por caminho `splits/{id}/proofs/...` | Segundo upload nega |
| Convidar / promover / tirar admin | Rules: só admin muda `adminUids`; `adminUids.size() >= 1` | Último admin não sai |
| Remover participante | **Function** `removeMember`: recalcula com `packages/calc`, exige `net` 0 e ausência em despesas | Emulador: bloqueia com saldo e com despesa |
| Entrar por convite / "Quem é você?" | **Function** `joinByCode` + `claimMember` (transação; nome travado se já tem uid) | Dois claims no mesmo nome: o segundo falha |
| Finalizar / reabrir | Rules: só admin muda `status`/`doneAt` | Membro nega |
| Notificações | **Function** triggers em `expenses`/`payments` | Marcar pago gera 1 notificação para o payer |
| Link de recuperação | **Function** `createRecoveryLink` / `redeemRecovery` → `createCustomToken` | Token revogado falha |

## 4. Fases

Uma fase por sessão, sempre começando com `/clear` e terminando com testes passando e commit. As decisões listadas em cada fase precisam estar fechadas em `docs/spec/pontos-em-aberto.md` antes de ela começar.

### Fase 1 — Motor de cálculo (`packages/calc`, sem tela)
Decisões: 1 ✅, 2 ✅. **Status: concluída.**
- Workspace raiz (`package.json`, `tsconfig.base.json`, Vitest), scripts `typecheck` e `test`.
- **Testes primeiro**:
  - pizza 2/1/3/2 sobre R$ 80,00
  - igualmente com resto (R$ 10,00 ÷ 3) distribuído por `joinOrder`, mesmo com `members[]` em outra ordem
  - frações por maior resto, com empate decidido por `joinOrder`
  - % que soma 100 (e rejeição quando ≠ 100)
  - exato que não fecha
  - itens com resto e `restMode`; valor vazio = soma dos itens
  - `paid` parcial, excedente e crédito
  - acertos abatendo dívida
  - `M`, `net`, `sug`
  - validação de "não deixa salvar" para cada modo
- Portar `shares`/`ledger` de `reference/design/Main.dc.html` (por volta da linha 1429) e ajustar às decisões 1 e 2.
- Hook do Claude Code em `.claude/settings.json`: PostToolUse em Edit/Write roda typecheck e testes.
- Preencher a seção Comandos do `CLAUDE.md`.
- **Pronto:** `npm test` verde, com cobertura de 100% em `packages/calc`.

### Fase 2 — Fundação do app (`apps/web`, sem regra de negócio)
- Vite + React + TS + HashRouter, `tokens.css` (claro/escuro), fontes Bricolage Grotesque e Figtree, i18n PT/EN, tema e idioma persistidos.
- Componentes da Folha de estilo: botão, avatar, selo, toast em pílula, sheet, switch `role="switch"`, skeleton.
- `firebase.json` com emuladores (auth, firestore, functions, storage) e `.firebaserc` com staging/prod.
- Playwright com screenshots em 390 e 1440; workflow do Actions (CI + Pages).
- Primitiva `useOptimisticAction`: aplica → chama → reverte em erro + toast.
- **Troca de paleta simples (a paleta ainda não está aprovada):**
  - Toda cor mora só em `tokens.css`: um bloco por tema, um token por linha, com um comentário dizendo onde a cor aparece. Nenhum outro arquivo tem hex, `rgb()` ou nome de cor; um teste falha se tiver.
  - Tela **Paleta** só de desenvolvimento (`/#/dev/paleta`, fora do build de produção):
    - um seletor de cor por token, nos temas claro e escuro;
    - prévia ao vivo dos componentes e de uma tela real (Saldo com cartões);
    - selo de contraste AA para cada par texto/fundo;
    - "Restaurar" e "Copiar CSS", que gera o bloco pronto para colar em `tokens.css`.
  - Não é tela do produto: é ferramenta de revisão, como as galerias do protótipo.
  - Ao aprovar uma paleta nova, atualize a tabela de tokens em `docs/spec/09-design-tema-a11y-idioma-desktop.md`.
- **Pronto:**
  - Folha de estilo renderizada e comparada com `reference/design/Estilo.dc.html` nos dois temas.
  - Mudar um valor em `tokens.css` (ou na tela Paleta) muda o app inteiro.
  - CI verde e Pages publicado.
  - **Requer o `support.js`** (ver `reference/LEIA-ME.md`).

### Fase 3 — Splits, participantes e permissões
Decisões: 3, 4.
- Login anônimo automático; home vazia ("Nenhum split por aqui").
- Criar split; tela de convite (link + código + Compartilhar).
- `joinByCode`, "Quem é você?" / "Não estou na lista".
- Aba Pessoas (admin × membro com cadeado e "fale com…"), promover/tirar admin, `removeMember`.
- `firestore.rules` + `storage.rules` com a suíte de regras da seção 3. O prompt de regras do MCP do Firebase ajuda aqui.
- **Pronto:** suíte de rules verde no emulador; e2e "cria split → convida → outro navegador entra pelo código"; screenshots ok.

### Fase 4 — Contas
Decisões: 5, 6.
- Tela de entrada (ilustração neutra), Google por popup, e-mail/senha.
- `linkWithPopup`/`linkWithCredential` preservando o UID; tratamento de `credential-already-in-use` conforme a decisão 5.
- Lembrete "Salve sua conta…" (uma vez por sessão).
- Link de recuperação: criar, resgatar, revogar em Sua conta.
- Sua conta: perfil, `selfName`, preferências, sair, troca de senha.
- **Pronto:** e2e "convidado cria split → salva com e-mail → splits continuam" e "link de recuperação restaura a identidade em outro contexto; link revogado falha".

### Fase 5 — Despesas
Decisões: 7, 8.
- Formulário de tela única com divisão inline nos 5 modos.
- Itens: minimizar, reabrir com erro, "Ver todos (N)". Resto da compra.
- Prévia em tempo real e mensagens de erro da spec.
- Mais detalhes: data, tags, nota, descrição longa, recibo.
- Transações agrupadas por dia, com busca e filtros Pessoas/Tags com contagem.
- Detalhe da despesa com histórico, editar/excluir com `version`, Desfazer (~4 s) como ação inversa.
- **Pronto:** testes de componente para cada regra de "não salva"; e2e lançando uma despesa por modo; screenshots × `Telas_3_Despesa`.

### Fase 6 — Saldo, Minha visão, pagamentos e comprovantes
Decisão: 9.
- Aba Saldo: cartões por pessoa, o seu primeiro e com `--me-soft`, Expandir/Minimizar, linhas `M`, resolvidos tracejados, fade de 4 px.
- Minha visão: Devo / Já paguei / A receber, linhas que ficam no lugar, "Acerto de contas", "Quitado no acerto".
- Marcar pago / Recebi otimistas, `pendConf`, Confirmar / Não recebi.
- Folha de comprovante (`askProof`) e upload no Storage com regras de leitura.
- **Pronto:** e2e de dois usuários (marcar pago → o outro confirma ou contesta); rules de Storage; screenshots × `Telas_5_Pagamentos`.

### Fase 7 — Notificações
Decisão: 10.
- Triggers das 4 situações da tabela da spec.
- Sino com contagem (até 9+) e "Marcar todas como lidas"; o sino some com `inapp` desligado.
- Destaque por `hlShare` (parâmetro de navegação) × pendência por `pendConf`.
- E-mail via Function, indisponível para convidado.
- **Pronto:** testes de Functions no emulador para cada evento; e2e "chegar pela notificação mostra o banner; voltar pela lista não mostra".

### Fase 8 — Finalizar, home completa, desktop e acabamento
- Finalizar/reabrir com resumo `sug`, "Finalizar mesmo assim" e modo só leitura.
- Filtro "Finalizados" e total da home.
- Layout ≥ 1024 px: barra lateral, Transações + Saldo lado a lado.
- Passada de a11y: contraste AA, alvos de 44 px, `prefers-reduced-motion`, `aria-pressed`.
- **Pronto:** screenshots 1440 × `Desktop.dc.html`; checagem axe sem violações sérias; revisão manual no iPhone e no Android pelo link do Pages.

## 5. Ações que só o Lucas pode fazer

- **Antes da Fase 2:**
  - Reexportar o pacote do Claude Design com `support.js`.
  - Criar o repositório no GitHub e habilitar o Pages via Actions.
- **Antes da Fase 3:**
  - Criar os projetos Firebase staging e prod e fazer upgrade para Blaze, com alerta de orçamento.
  - `npm i -g firebase-tools && firebase login`.
  - Opcional: `claude plugin install firebase@firebase`.

## 6. Prompt de cada fase

```text
Implemente a Fase N de docs/plan.md.

Antes de codar, escreva os testes a partir de docs/spec/ e confirme que
falham. Depois implemente até passarem. Se a fase mexe em UI, abra o app
em 390 px e 1440 px, compare com reference/ e corrija as diferenças.

Se esbarrar num ponto em aberto, pare e pergunte.
No fim, mostre a saída dos testes e faça commit com mensagem descritiva.
```
