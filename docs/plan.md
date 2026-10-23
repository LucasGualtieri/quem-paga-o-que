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
  - `members: { [memberId]: { name, nameKey, uid|null, admin, joinOrder, joinedAt, isNew? } }`; `nameKey` é o nome normalizado (minúsculas, sem acentos, espaços colapsados), único no split (decisão 3).
  - `uids: string[]` e `adminUids: string[]` (espelhos derivados de `members`, usados pelas regras), `nextJoinOrder`.
  - O admin é do **participante** (`members[x].admin`), não do UID: "Liberar nome" e "Sair do split" desvinculam o UID e tiram o admin juntos (decisões 3 e 4).
  - Participante = `memberId` (estável); o vínculo com o usuário é `members[x].uid`. Quem cria entra já vinculado ao próprio uid.
- `splits/{id}/expenses/{expId}`:
  - `name, amount, payer, members[], mode, w, items[], rest[], restMode, restW, date, tags[], note, longDesc, receiptPath?, author, version, createdAt, updatedAt`
  - `paid: {[memberId]: cents}`, `proof: {[memberId]: path}`, `pendConf: {[memberId]: true}`
  - Todos os ids são `memberId`.
- `splits/{id}/expenses/{expId}/history/{hId}`: `{kind, by, at, from?, to?, memberId?}`. Só Functions escrevem aqui.
- `splits/{id}/payments/{pid}`: `from, to, amount, when, proofPath?, by`.
- `inviteCodes/{code}` → `{splitId}`. Só Functions leem.
- `recoveryTokens/{sha256(token)}` → `{uid, createdAt, revokedAt?}`. Só Functions acessam. Um token ativo por pessoa (gerar outro revoga o anterior); revogado ao salvar a conta (decisão 6).
- `mergeTokens/{sha256(token)}` → `{guestUid, expiresAt}`: prova curta (10 min) de que quem pede a fusão era o convidado. Só Functions acessam (decisão 5).
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
| Participantes e papéis (qualquer mudança em `members`, `uids`, `adminUids`) | Rules: **nenhuma escrita direta**; tudo passa por Functions em transação, que mantêm os espelhos coerentes e a regra "sempre ao menos um admin" | Escrita direta em `members` nega, até para admin |
| Criar split | **Function** `createSplit`: nomes sem repetir (`nameKey`), quem cria vira admin | Nomes "Lucas" e "lúcas" juntos falham |
| Promover / tirar admin de outro | **Function** `setAdmin` (só admin; nunca deixa zero admins) | Membro nega; admin tira outro admin ok |
| Deixar de ser admin | **Function** `setAdmin` sobre si mesmo: só se restar outro admin | Último admin nega com a mensagem da spec |
| Liberar nome | **Function** `releaseName` (só admin): `uid = null`, `admin = false`, tira dos espelhos | Membro nega; quem foi liberado perde a leitura do split |
| Sair do split | **Function** `leaveSplit`: recalcula com `packages/calc`, exige `net` 0; admin só se restar outro admin | Bloqueia com saldo; último admin nega; depois de sair, não lê mais o split |
| Remover participante | **Function** `removeMember`: recalcula com `packages/calc`, exige `net` 0 e ausência em despesas | Emulador: bloqueia com saldo e com despesa |
| Entrar por convite / "Quem é você?" | **Function** `joinByCode` + `claimMember` (transação; nome travado se já tem uid) e "Não estou na lista" com `nameKey` único | Dois claims no mesmo nome: o segundo falha; nome repetido falha |
| Finalizar / reabrir | Rules: só admin muda `status`/`doneAt` | Membro nega |
| Notificações | **Function** triggers em `expenses`/`payments` | Marcar pago gera 1 notificação para o payer |
| Link de recuperação | **Function** `createRecoveryLink` / `redeemRecovery` → `createCustomToken`; `revokeRecovery` | Token revogado falha; gerar outro revoga o anterior; salvar a conta revoga |
| Gerar novo código de convite | **Function** `regenerateCode` (só admin): apaga o código antigo e cria outro na mesma transação | Membro nega; código antigo dá `invalid-code` |
| Fusão convidado → conta existente | **Functions** `prepareMerge` (como convidado: devolve token curto) → `previewMerge` / `mergeGuest` (já na conta: move os nomes, resolve conflitos pela escolha da pessoa, herda admin, apaga o usuário anônimo e revoga o link dele) | Token de outro usuário ou vencido falha; conflito sem escolha falha; nenhum split fica sem admin |

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
- **Status: concluída.** Notas da implementação:
  - Telas de desenvolvimento em `/#/dev` (índice), `/#/dev/estilo` (Folha de estilo nos dois temas + toast, folha, carregando e ação otimista) e `/#/dev/paleta`. Ligadas no `vite dev` e com `VITE_DEV_TOOLS=true`; sem a variável, nem entram no bundle.
  - **O Pages publica com as telas de desenvolvimento ligadas** até o lançamento, para revisar no celular pelo link. Desligar `VITE_DEV_TOOLS` no workflow antes de lançar.
  - A prévia da Paleta mostra os componentes; a tela de Saldo entra na prévia na Fase 6, quando existir.
  - Mudanças feitas na Paleta valem só no navegador de quem mexeu (localStorage) até alguém colar o "Copiar CSS" em `tokens.css`.
  - `.firebaserc`: `demo-qpq` (padrão, emuladores) e `staging` → `qpq-staging`. O alias `prod` entra quando o projeto de produção existir.
  - Os emuladores exigem **Java 21+** (o `firebase-tools` 15 recusa versões anteriores). No CI sobem com Temurin 21.
  - Texto do toast de erro do otimismo ("Não deu para salvar. Voltamos ao que estava.") não está na spec; revisar.

### Fase 3 — Splits, participantes e permissões
Decisões: 3 ✅, 4 ✅.
- Login anônimo automático; home vazia ("Nenhum split por aqui").
- Criar split (`createSplit`, sem nomes repetidos); tela de convite (link + código + Compartilhar).
- `joinByCode`, "Quem é você?" (nome já escolhido aparece desabilitado com "Já escolhido") / "Não estou na lista" (sem nome repetido).
- Aba Pessoas (admin × membro com cadeado e "fale com…"): promover/tirar admin, "Liberar nome", `removeMember`; "Deixar de ser admin" na sua linha.
- "Sair do split" no menu de três pontos (`leaveSplit`, só com saldo zero; último admin bloqueado).
- Emulador de Functions e `functions/` (TypeScript, `us-east1`), importando `@qpq/calc`.
- Normalização de nome (`nameKey`) num módulo compartilhado, com testes (maiúsculas, acentos, espaços).
- `firestore.rules` + `storage.rules` com a suíte de regras da seção 3. O prompt de regras do MCP do Firebase ajuda aqui.
- **Pronto:** suíte de rules verde no emulador; e2e "cria split → convida → outro navegador entra pelo código"; screenshots ok.
- **Status: concluída.** Notas da implementação:
  - `packages/shared`: normalização de nomes (`nameKey`), código e link de convite, emojis de capa e o contrato das Functions (pedidos, respostas e motivos de recusa).
  - `functions/`: `createSplit`, `previewInvite`, `joinSplit`, `setAdmin`, `releaseName`, `leaveSplit`, `removeMember` (us-east1), empacotadas com esbuild (inclui `@qpq/calc` e `@qpq/shared`). Saldo para sair/remover sempre pelo `@qpq/calc`.
  - Regras: leitura só para quem está no split; escrita direta em `splits` sempre negada; despesas e acertos só leitura até as Fases 5 e 6; `users/{uid}` só leitura do próprio até a Fase 4.
  - App: home (lista, total, filtros), Novo split, "está pronto" com link/código, Entrar com código ou link, "Quem é você?", tela do split com abas e Pessoas completa, menu com Convidar, tema e Sair do split.
  - UX otimista: Pessoas (tornar/tirar admin, liberar nome, remover) muda na hora e volta com toast se o servidor recusar; criar abre o convite na hora; entrar abre o split na hora (carregando); sair tira o split da home na hora. As mesmas checagens do servidor rodam antes na tela (avisos na própria linha).
  - Abas Transações, Saldo e Minha visão mostram só "Nenhuma despesa ainda" (sem o "+") até as Fases 5 e 6. Capa com foto fica para a Fase 6.
  - **Staging ligado (23/10/2026):** projeto `qpq-staging` (Firestore em us-east1, login anônimo), regras e as 7 Functions publicadas em us-east1 com `npm run deploy:staging`. O Pages lê `VITE_FIREBASE_*` das variáveis do repositório (configuração pública do app web) e publica o produto ligado ao staging, com as telas de revisão ainda em `/#/dev`.
  - Dois problemas que os emuladores não mostravam, corrigidos no deploy: as Functions chamáveis precisam de invoker público (a autenticação e as checagens ficam dentro de cada função), e o `getFirestore` precisa receber o app (o `firebase-admin` carregava por dois caminhos de módulo no pacote publicado).
  - Textos novos que não estão no protótipo (revisar): "chegou pelo convite", "ainda não entrou", "Liberar nome", "Deixar de ser admin", "Sair do split" (folha e avisos), mensagens de convite inválido e de nome já escolhido.

### Fase 4 — Contas
Decisões: 5 ✅, 6 ✅.
- Tela de entrada (ilustração neutra), Google por popup, e-mail/senha.
- `linkWithPopup`/`linkWithCredential` preservando o UID.
- Conta já existe (`credential-already-in-use` / e-mail em uso): `prepareMerge` ainda como convidado → entrar na conta → `previewMerge` → se houver split com os dois nomes, folha "qual nome manter" por split → `mergeGuest`. Preferências da conta valem.
- Lembrete "Salve sua conta…" (uma vez por sessão).
- Link de recuperação: criar (gerar outro revoga o anterior), resgatar, revogar em Sua conta; revogado ao salvar a conta.
- "Gerar novo código" em Pessoas (admin), com folha de confirmação.
- Sua conta: perfil, `selfName`, preferências, sair, troca de senha.
- **Pronto:** e2e "convidado cria split → salva com e-mail → splits continuam", "convidado salva com e-mail que já existe → splits vêm junto; mesmo split pergunta qual nome", "link de recuperação restaura a identidade em outro contexto; link revogado falha" e "código novo: o antigo para de funcionar".

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
