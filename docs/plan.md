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

- `users/{uid}`: `displayName`, `email?`, `photoPath?` (foto em `users/{uid}/…` no Storage; o dono grava), `prefs {inapp, email, selfName, askProof, theme, lang}`, `createdAt`. O campo `push` não existe na v1, que só tem web.
- `splits/{splitId}`:
  - `name, emoji, photo?` (capa em `covers/{id}/…`), `proofVisibility: all|involved` (decisão 9), `status: open|done, doneAt?, code, createdAt`
  - `members: { [memberId]: { name, nameKey, uid|null, admin, joinOrder, joinedAt, isNew? } }`; `nameKey` é o nome normalizado (minúsculas, sem acentos, espaços colapsados), único no split (decisão 3).
  - `uids: string[]` e `adminUids: string[]` (espelhos derivados de `members`, usados pelas regras), `nextJoinOrder`.
  - O admin é do **participante** (`members[x].admin`), não do UID: "Liberar nome" e "Sair do split" desvinculam o UID e tiram o admin juntos (decisões 3 e 4).
  - Participante = `memberId` (estável); o vínculo com o usuário é `members[x].uid`. Quem cria entra já vinculado ao próprio uid.
- `splits/{id}/expenses/{expId}`:
  - `name, amount, payer, members[], mode, w, items[], rest[], restMode, restW, date, tags[], note, longDesc, receiptPath?, author, version, createdAt, updatedAt`
  - `paid: {[memberId]: cents}`, `proof: {[memberId]: {path|null, at, by}}` (`path: null` = expirou), `pendConf: {[memberId]: true}`, `receipt: {path|null, at, by}|null` (comprovante da despesa), `paySeq` (sobe a cada mudança de pagamento; não é `version`)
  - Todos os ids são `memberId`.
- `splits/{id}/expenses/{expId}/history/{hId}`: `{kind, by, at, from?, to?, memberId?}`. Só Functions escrevem aqui.
- `splits/{id}/payments/{pid}`: `from, to, amount, when, proof: {path|null, at, by}|null, by`. Só Functions escrevem.
- `proofs/{sha256(path)}` → `{splitId, path, at, target}`: prazo de 15 dias de cada comprovante (decisão 9). Só Functions acessam; a rotina diária `purgeProofs` apaga a foto e deixa `path: null`.
- `inviteCodes/{code}` → `{splitId}`. Só Functions leem.
- `recoveryTokens/{sha256(token)}` → `{uid, createdAt, revokedAt?}`. Só Functions acessam. Um token ativo por pessoa (gerar outro revoga o anterior); revogado ao salvar a conta (decisão 6).
- `mergeTokens/{sha256(token)}` → `{guestUid, expiresAt}`: prova curta (10 min) de que quem pede a fusão era o convidado. Só Functions acessam (decisão 5).
- `notifications/{nid}` (coleção de topo, filtrada por `to` = uid): `to, toMember, kind: paid|settled|proof|disputed, splitId, splitName, from, fromName, amount, hasProof, expId?, expName?, memberId?, paymentId?, payFrom?, payTo?, at, read, status: new|confirmed|disputed, hidden`. Só Functions criam; o dono só muda `read` para `true`. Índice `to` + `at desc`.

### Sempre calculado, nunca guardado

Parte de cada um (`shares`), `P`, `M`, `net`, `sug`, total da home e "1 pagamento p/ conferir".

### Valor pago

A parte quitada é `min(paid[x], share[x])`. Se `paid[x] < share[x]`, a diferença é pendente e entra em `P[x][payer]`. Se `paid[x] > share[x]`, o excedente vira crédito: entra em `P[payer][x]`.

## 3. Permissões: onde e como testar

| Ação | Garantia | Teste |
| --- | --- | --- |
| Ler split e subcoleções | Rules: `auth.uid in split.uids` | Membro lê, estranho não |
| Lançar despesa | Rules: membro, split `open`, `author` = meu memberId, validação de forma (inteiros ≥ 0, `version == 1`) | Lança com e sem permissão; split finalizado bloqueia |
| Lançar / editar / excluir / desfazer despesa | **Functions** `createExpense`, `updateExpense`, `deleteExpense`, `restoreExpense` (as regras negam escrita direta): membro lança; autor ou admin edita/exclui; split `open`; valida com `@qpq/calc` (`validateExpense`); `version` +1 a cada mudança; edição com versão atrasada recusa com `version-conflict` (nome de quem alterou) a menos que `force` ("Salvar a minha por cima"); excluir = marcar `deletedAt` e só sem `paid` nem `pendConf` (`has-payments`); histórico em `history/` só por Function | Não-membro, não-autor e split finalizado negam; dados que o motor recusa negam; versão errada avisa; excluir com parte paga nega; desfazer exige as pessoas ainda no split |
| Marcar parte paga | **Function** `markShare` (as regras negam escrita direta em despesas): caller = a própria pessoa, quem pagou ou admin; valor = parte calculada pelo `@qpq/calc`; `pendConf` só quando quem marca não é quem pagou; Desfazer = `unmarkShare` (apaga o comprovante) | Matriz de quem pode marcar a parte de quem (`functions/test/payments.test.ts`) |
| Confirmar / "Não recebi" | **Functions** `confirmShare` / `disputeShare`: só quem pagou a despesa ou admin, e só com `pendConf`; "Não recebi" apaga `paid[x]`, `pendConf[x]` e o comprovante | Membro comum não confirma pelo outro; sem pendência recusa |
| Registrar acerto | **Function** `createPayment`: `from`/`to` = caller ou admin, split `open`; o valor é a dívida atual do par (`M`), calculada no servidor (0 = nada gravado) | Terceiro não-admin nega; repetir não duplica |
| Desfazer acerto | **Function** `deletePayment`: `from`/`to` ou admin; `open`; apaga o comprovante | Idem |
| Anexar comprovante depois | **Function** `attachProof` + Storage rules em `splits/{id}/proofs/{from}/{to}/…` (só imagem ≤ 2 MB, só criar); só enquanto não houver (expirado conta); na parte de despesa as duas pessoas ou admin, no acerto só as duas | Segundo envio nega; caminho de outro par nega; leitura conforme "Quem vê comprovantes" (`storage.rules.test.ts`) |
| Participantes e papéis (qualquer mudança em `members`, `uids`, `adminUids`) | Rules: **nenhuma escrita direta**; tudo passa por Functions em transação, que mantêm os espelhos coerentes e a regra "sempre ao menos um admin" | Escrita direta em `members` nega, até para admin |
| Criar split | **Function** `createSplit`: nomes sem repetir (`nameKey`), quem cria vira admin | Nomes "Lucas" e "lúcas" juntos falham |
| Promover / tirar admin de outro | **Function** `setAdmin` (só admin; nunca deixa zero admins) | Membro nega; admin tira outro admin ok |
| Deixar de ser admin | **Function** `setAdmin` sobre si mesmo: só se restar outro admin | Último admin nega com a mensagem da spec |
| Liberar nome | **Function** `releaseName` (só admin): `uid = null`, `admin = false`, tira dos espelhos | Membro nega; quem foi liberado perde a leitura do split |
| Sair do split | **Function** `leaveSplit`: recalcula com `packages/calc`, exige `net` 0; admin só se restar outro admin | Bloqueia com saldo; último admin nega; depois de sair, não lê mais o split |
| Remover participante | **Function** `removeMember`: recalcula com `packages/calc`, exige `net` 0 e ausência em despesas | Emulador: bloqueia com saldo e com despesa |
| Entrar por convite / "Quem é você?" | **Function** `joinByCode` + `claimMember` (transação; nome travado se já tem uid) e "Não estou na lista" com `nameKey` único | Dois claims no mesmo nome: o segundo falha; nome repetido falha |
| Finalizar / reabrir | **Functions** `finalizeSplit` / `reopenSplit` (só admin; as regras negam escrita em `splits`); finalizar apaga os comprovantes do split | Membro nega; finalizado recusa lançar e marcar (`split-done`); comprovantes viram expirados (`finalize.test.ts`) |
| Notificações | **Functions** de pagamento criam/atualizam o aviso na mesma transação; regras: só o dono lê e só marca como lido | Cada uma das 4 situações; confirmar/contestar/Recebi mudam o estado; excluir/desfazer esconde (`notifications.test.ts`, `rules.test.ts`) |
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
- **Status: concluída.** Notas da implementação:
  - Functions novas: `createRecoveryLink`, `revokeRecovery`, `redeemRecovery` (token próprio do Firebase), `regenerateCode`, `prepareMerge`, `previewMerge`, `mergeGuest`. Só o hash dos tokens fica no Firestore. Ajudantes comuns em `functions/src/common.ts`.
  - "Convidado" = nenhuma credencial ligada (`identities` vazio no token), não só `sign_in_provider == anonymous`: quem volta pelo link de recuperação entra com token próprio e continua convidado (no servidor e no app).
  - Regras: `users/{uid}` aceita do dono só `displayName` (1–40) e `prefs` com chaves e tipos conhecidos; `recovery` só as Functions escrevem.
  - App: tela de entrada (ilustração neutra), e-mail (criar, entrar, esqueci a senha), Google por popup, `/juntar` (escolher o nome por split), "Não perca seus splits" (`/salvar`), `/r/:token`, Sua conta (perfil, "Você × nome", notificações e comprovante como preferências, tema, idioma, sair), lembrete após criar, avatar na home, "Gerar novo código" em Pessoas.
  - Tema e idioma sincronizam com a conta (`PrefsSync`).
  - Push não aparece no navegador (spec 07). "Trocar foto" fica para a Fase 6 (Storage). E-mail só leitura na v1.
  - Como só o hash do link de recuperação é guardado, ele não pode ser mostrado de novo: com um link ativo, a tela mostra "Você já guardou um link… em {data}" e "Gerar novo link".
  - **Configuração manual do staging — feita em 23/10/2026** (console do Firebase e do Google Cloud): ligar os provedores E-mail/senha e Google, autorizar o domínio `lucasgualtieri.github.io`, e dar à conta de serviço das Functions o papel "Criador de token da conta de serviço" (para `createCustomToken`; sem ele, `redeemRecovery` dá 500 com `iam.serviceAccounts.signBlob`). Verificado no staging: link de recuperação devolve a mesma identidade em outro aparelho, link revogado é recusado, criar conta com e-mail funciona. O papel novo levou cerca de 1 minuto para valer.
  - Deploy de Function nova no staging: na criação o Cloud Run não recebeu o invoker público (401 em HTML antes do código); um segundo deploy, que é atualização, aplicou. Registrado no `CLAUDE.md`.
  - Textos novos fora do protótipo (revisar): tela de e-mail, tela de juntar, avisos de sair sem conta, link já guardado, revogar, gerar novo código.

### Fase 5 — Despesas
Decisões: 7 ✅, 8 ✅.
- Formulário de tela única com divisão inline nos 5 modos.
- Itens: minimizar, reabrir com erro, "Ver todos (N)". Resto da compra.
- Prévia em tempo real e mensagens de erro da spec.
- Mais detalhes: data, tags, nota, descrição longa, recibo.
- Transações agrupadas por dia, com busca e filtros Pessoas/Tags com contagem.
- Detalhe da despesa com histórico, editar/excluir com `version`, Desfazer (~4 s) como ação inversa.
- Excluir: bloqueado com parte paga ou pendência (decisão 7); é exclusão marcada (`deletedAt`), que some de listas, saldos (o `@qpq/calc` recebe só as não excluídas) e notificações; Desfazer limpa a marca.
- Conflito de edição por `version` (decisão 8): aviso com "Ver a versão nova" ou "Salvar a minha por cima"; marcar pago/confirmar/comprovante não mexem em `version`.
- **Status: concluída.** Notas da implementação:
  - Escrita de despesas só por Functions (não por regras): o motor de cálculo valida tudo e uma despesa inválida nunca chega ao banco (senão `ledger` quebraria para o split inteiro). As regras só deixam ler despesas e histórico.
  - O app gera o id da despesa e a mostra na hora (`expenseStore`); as chamadas de uma mesma despesa saem em fila (Desfazer logo após lançar espera a criação). Conflito de edição: a edição não salva volta e abre "Beatriz alterou esta despesa enquanto você editava." com "Ver a versão nova" / "Salvar a minha por cima".
  - Saldo e `removeMember`/`leaveSplit` ignoram despesas excluídas; desfazer a exclusão confere se todos ainda estão no split.
  - Itens ganharam nome (aparece no detalhe). **Comprovante** do formulário e do detalhe fica para a Fase 6 (Storage); as ações de pagamento do detalhe também (hoje só leitura: Pendente/Pago).
  - Saldo e Minha visão seguem vazios até a Fase 6; a aba Transações mostra "sua parte" / "a receber" já descontando o que foi pago.
  - Textos novos fora do protótipo (revisar): aviso de conflito, bloqueio de exclusão, "Limpar" do Dividir com, mensagens de erro dos itens.
- **Pronto:** testes de componente para cada regra de "não salva"; testes de regras para versão e exclusão bloqueada; e2e lançando uma despesa por modo, excluindo com Desfazer e editando em dois navegadores ao mesmo tempo (aviso de conflito); screenshots × `Telas_3_Despesa`.

### Fase 6 — Saldo, Minha visão, pagamentos e comprovantes
Decisão: 9 ✅ (quem vê é escolha do split, padrão "Todo o split"; no máximo 15 dias e apagado ao finalizar; só imagem recomprimida).
- Aba Saldo: cartões por pessoa, o seu primeiro e com `--me-soft`, Expandir/Minimizar, linhas `M`, resolvidos tracejados, fade de 4 px.
- Minha visão: Devo / Já paguei / A receber, linhas que ficam no lugar, "Acerto de contas", "Quitado no acerto".
- Marcar pago / Recebi otimistas, `pendConf`, Confirmar / Não recebi.
- Folha de comprovante (`askProof`) e upload no Storage com regras de leitura.
- **Pronto:** e2e de dois usuários (marcar pago → o outro confirma ou contesta); rules de Storage; screenshots × `Telas_5_Pagamentos`.
- **Status: concluída.** Notas da implementação:
  - Pagamentos também só por Functions (`functions/src/payments.ts`): `markShare`, `unmarkShare`, `confirmShare`, `disputeShare`, `createPayment`, `deletePayment`, `attachProof`, `setReceipt`, `setSplitPhoto`, `setProofVisibility`. Nenhum mexe em `version` (decisão 8); a parte paga sobe `paySeq` e entra no Histórico (marcou que pagou, confirmou, desfez, avisou que não recebeu, enviou comprovante). O valor do acerto é calculado no servidor (`M` do par).
  - UX otimista: `data/payStore.ts` põe a marcação, o acerto e o comprovante por cima do snapshot na hora e tira quando o servidor alcança (`paySeq`, id do acerto); se o servidor recusar, volta com toast. Toast com Desfazer ao marcar pago / Recebi / acerto.
  - Comprovante (decisão 9): o app reduz para 1600 px e regrava em JPEG ≤ 1 MB (sem metadados), sobe direto ao Storage e chama `attachProof`. A leitura é sempre por `getBlob` (passa pelas regras), nunca por link público. Rotina diária `purgeProofs` (us-east1, 04:00 de Brasília): passou de 15 dias, apaga a foto e marca `path: null` ("comprovante expirado"); apaga também fotos enviadas e nunca anexadas. **Apagar ao finalizar fica para a Fase 8** (Finalizar ainda não existe).
  - "Quem vê comprovantes" em Pessoas (admin escolhe; membro vê a opção). Comprovante da despesa no formulário (Mais detalhes) e no detalhe; capa com foto em Novo split; "Trocar foto" em Sua conta (avatar da home também).
  - O resolvido no cartão do Saldo ficou com valor em cima e ações (câmera, Desfazer) embaixo: em 390 px a linha do protótipo quebrava o texto em três linhas. A câmera abre o comprovante quando há um.
  - A prévia de Saldo na tela Paleta (prometida na Fase 2) ficou para a Fase 8: a aba lê sessão e perfil do Firebase e a Paleta roda sem back-end.
  - Notificações dos pagamentos são da Fase 7: os toasts ainda não dizem "avisamos Beatriz".
  - **Storage do staging configurado (23/10/2026):** bucket `qpq-staging.firebasestorage.app` em us-east1, CORS de `storage.cors.json` (só GET, só o Pages e localhost) e o papel `roles/firebaserules.firestoreServiceAgent` para a conta de serviço do Storage (regras entre serviços; o deploy não interativo não concede sozinho). Verificado com envio e leitura reais.
  - Textos novos fora do protótipo (revisar): "Marcamos que o pagamento de {nome} não chegou", "{nome} pode conferir o comprovante.", "Comprovantes ficam guardados por 15 dias.", "comprovante expirado", textos de "Quem vê comprovantes", "Só os envolvidos e admins veem este comprovante.", erros de foto, linhas do Histórico de pagamento, motivos de recusa novos.

### Fase 7 — Notificações
Decisão: 10 ✅ (Resend, agrupado em 10 min, resumo + botão, sem foto; **e-mail adiado até haver domínio**: a fase entrega só o app e esconde "Por e-mail").
- Triggers das 4 situações da tabela da spec.
- Sino com contagem (até 9+) e "Marcar todas como lidas"; o sino some com `inapp` desligado.
- Destaque por `hlShare` (parâmetro de navegação) × pendência por `pendConf`.
- E-mail via Function, indisponível para convidado.
- **Pronto:** testes de Functions no emulador para cada evento; e2e "chegar pela notificação mostra o banner; voltar pela lista não mostra".
- **Status: concluída (sem e-mail).** Notas da implementação:
  - Avisos criados dentro das Functions de pagamento (não por trigger): o aviso existe se e só se o pagamento foi gravado, e os testes não precisam esperar. Coleção de topo `notifications` (não `users/{uid}/notifications`): a Function acha os avisos de uma parte ou acerto com uma consulta simples.
  - Quem é avisado: marcar a **própria** parte avisa quem pagou (admin marcando pelo outro ou "Recebi" de quem pagou não avisam); acerto avisa a outra pessoa (as duas, se foi um admin de fora); comprovante enviado logo depois de marcar entra no mesmo aviso ("com comprovante"), depois vira aviso novo; "Não recebi" avisa quem marcou. Quem ainda não entrou no split não recebe aviso.
  - Estado do aviso "pagou": Confirmar → confirmado; Não recebi → contestado; "Recebi" de quem pagou resolve contestação antiga. Desfazer da própria pessoa esconde o aviso que ainda esperava confirmação; excluir a despesa ou desfazer o acerto esconde os avisos deles; restaurar a despesa traz de volta.
  - App: sino na home e no split (contagem até "9+", some com "No app" desligado), tela `/notificacoes` (lista, "Marcar todas como lidas", "Gerenciar notificações"), banner no detalhe só com `?n=` (chegou pelo aviso), linha destacada e Confirmar/Não recebi só no banner. Toasts dizem "avisamos Beatriz" quando a pessoa vai mesmo receber.
  - E-mail (decisão 10): opção escondida em Sua conta até haver domínio; nada de envio implementado.
  - Textos novos fora do protótipo (revisar): títulos de acerto ("marcou que recebeu … de você", "registrou que …"), "enviou um comprovante", "avisou que não recebeu", e os ícones do selo do aviso por tipo (câmera, alerta).

### Fase 8 — Finalizar, home completa, desktop e acabamento
- Finalizar/reabrir com resumo `sug`, "Finalizar mesmo assim" e modo só leitura. Finalizar apaga na hora os comprovantes (de pagamento e de despesa) do split (decisão 9).
- Filtro "Finalizados" e total da home.
- ~~Layout ≥ 1024 px: barra lateral, Transações + Saldo lado a lado.~~ **Descartado em 24/10/2026:** o desktop usa a mesma UI do celular (spec 09 e 10).
- Passada de a11y: contraste AA, alvos de 44 px, `prefers-reduced-motion`, `aria-pressed`.
- **Pronto:** screenshots 1440 × `Desktop.dc.html`; checagem axe sem violações sérias; revisão manual no iPhone e no Android pelo link do Pages.
- **Status: concluída** (falta só a revisão manual no iPhone e no Android, do Lucas). Notas da implementação:
  - Finalizar e reabrir por Functions (só admin). Finalizar apaga na hora os comprovantes do split (registros `proofs/` e tudo em `splits/{id}/` no Storage), deixando-os como expirados; reabrir não traz de volta. A folha avisa: "Os comprovantes deste split são apagados ao finalizar."
  - App: "Finalizar split" e "Reabrir" no menu (desabilitados para membro, com "só admin"), folha com o resumo `sug` e "Finalizar mesmo assim", aviso "Finalizado em …" com Reabrir (admin), tudo otimista. Home e barra lateral mostram "Finalizado em …". "Sua conta" entrou no menu do split, como a spec pede.
  - Desktop: o layout de duas colunas do `Desktop.dc.html` chegou a ser feito e foi **descartado** a pedido do Lucas (muita informação na tela, duas UIs para aprender e manter). No desktop vale a mesma UI do celular, numa coluna centralizada de até 560 px; um e2e confere que em 1440 px é a mesma tela, sem rolagem horizontal.
  - Acessibilidade: e2e com axe nas telas do produto (home, abas do split, notificações, conta), nos dois temas e nas duas larguras, sem violações sérias. `prefers-reduced-motion` desliga as animações novas.
  - A prévia de Saldo entrou na tela Paleta (hoje `dev/MyViewPreview.tsx`, a prévia da Minha visão).
  - Textos novos fora do protótipo (revisar): "Os comprovantes deste split são apagados ao finalizar."

### Ajustes finos depois da Fase 8 (24/10/2026)
- **Primeira leva:** sem realce de toque no Android, tagline nova, linha paga fica no lugar.
- **Segunda leva:**
  - Último admin pode sair (com saldo zero) ou deixar de ser admin; o papel passa para quem entrou primeiro entre os que já escolheram o nome, ou para a próxima pessoa que entrar (decisão 4 revista).
  - Chave Pix no perfil (uma por pessoa, convidado também), vista só por quem divide um split com a pessoa; "Copiar Pix" gera o Pix copia e cola com o valor.
  - Ícone ou emoji em despesas e itens (seletor com abas Ícones e Emoji, busca, "Remover" volta ao automático pela tag).
  - **Aba Saldo saiu; a Minha visão virou o lugar do dinheiro** (spec 06): seu saldo, um cartão por pessoa com o saldo do par (devo / me deve / quitado), "Marcar como pago" do par num acerto só, Copiar Pix, "Recebi", e o cartão aberto lista despesas e acertos. Acertos agora têm confirmação de quem recebe (Confirmar / "Não recebi", Functions `confirmPayment` e `disputePayment`). Admin vê como qualquer pessoa ("Ver como").
- **Terceira leva:**
  - Foto de perfil no lugar da inicial em todos os avatares do split: a Function `setProfilePhoto` grava no perfil e espelha em `members.{id}.photo` (como a chave Pix); entrar, sair e a fusão de convidado levam junto.
  - Barra de abas com uma coluna por aba (estava em 4 colunas depois que o Saldo saiu).
  - Campos em R$ como no caixa eletrônico (spec 05).
  - Excluir o split inteiro (só admin, digitando o nome; `deleteSplit`) e split sem ninguém apagado depois de 15 dias (rotina diária `purgeEmptySplits`, contando de `emptySince`). Fica a lápide `deletedSplits/{id}` para o link e o convite antigos explicarem o que houve (spec 04). Splits que já estavam vazios antes desta versão não têm `emptySince` e não são apagados.
- **Quarta leva (25/10/2026):**
  - Vermelho do modo escuro: o tom do claro, clareado para o contraste (#F0642E), em tudo que usa `--neg` (deve, erros, excluir); todo valor negativo com "−".
  - "Minha visão" virou **Meu saldo** (`/saldo`, ícone de setas trocadas); `/eu` leva para lá.
  - Convite com o nome do split: a mensagem de Copiar/Compartilhar diz "Entre no split …: <link>", e o link é o curto do Firebase Hosting (`<projeto>.web.app/c/ABC-123`), cuja página (Function `invitePage`) traz nome e emoji nas tags Open Graph e abre o convite no app. Nos emuladores o link continua o do app.
  - "Ajustar foto" (perfil e capa): arrastar, zoom e prévia ao vivo nos tamanhos em que a foto aparece; sobe só o recorte quadrado.
  - Ícone do item visível com o cartão minimizado.
  - Capa do split com ícone, emoji (o mesmo seletor das despesas) ou foto; sem escolha, o ícone de pessoas. Splits antigos mantêm o emoji.
- **Quinta leva (25/10/2026):**
  - Placeholder "Nome do amigo (opcional)"; aba "Transações" virou **Despesas**.
  - Editar o split (nome e capa; só admin; Function `updateSplit`), pelo menu ou tocando na capa/nome do cabeçalho.
  - Ações do split na home ("⋯" e toque longo): Editar, Convidar, Finalizar/Reabrir, Excluir e Sair, com as mesmas folhas de dentro do split (`screens/SplitActions.tsx`). Edições, finalizar e reabrir otimistas valem na home e dentro do split (`data/splitEdits.ts`).
- **Sexta leva (25/10/2026):**
  - "+" em todo valor a receber (o "−" já valia para o que se deve).
  - Legenda em Pessoas quebra linha em vez de passar por baixo do selo Membro/Admin.
  - "?" com explicação (componente `InfoTip`) em "Liberar nome", "Ver como" e "compensado no saldo".
  - Capa sorteada entre 24 ícones curados na criação (`AUTO_COVER_ICONS`, `pickCover`); splits antigos sem escolha usam `autoCover(id)`; "Remover" põe o ícone de pessoas.
  - Ajustes depois do teste à mão: "Salvar despesa" diz o que falta ("Falta: descrição e valor") e, tocado, leva ao primeiro campo com problema; "?" dentro de texto centrado na linha; em "Ver como", a explicação destaca "admins" no lilás do selo de Admin; folga no fim da aba Despesas para o "+" não cobrir o último cartão.
  - Vermelho do modo escuro trocado para o vermelho puro (#EF5350, fundo #3B1617): o anterior puxava para o laranja; o tom exato do claro ficou escuro demais (2,9:1).
  - Detalhe da despesa por itens: cada item mostra como foi dividido e quanto ficou para cada um, e uma linha "Resto da compra" mostra o valor que sobrou e a divisão dele (`itemsBreakdown`).
  - Finalização automática (spec 04): as Functions que mudam o saldo marcam `moneyAt` no split; 24 h depois de todos quitados os admins veem a sugestão de finalizar (`finalizeSuggestion`), e 7 dias depois a rotina `autoFinalizeSplits` (de hora em hora) finaliza e avisa todos. Splits sem `moneyAt` (anteriores a esta versão) só entram na contagem na próxima mudança no dinheiro.
  - Favicon provisório: duas moedas com o selo de "pago" (`apps/web/public/favicon.svg`, com PNG de 32 px e o ícone de 180 px do iPhone gerados por `node scripts/make-favicons.mjs`). As cores são cópias de `tokens.css`, porque o navegador não lê as variáveis do app.
  - Teste à mão no celular: `npm run dev:lan` (emuladores na rede local e split de exemplo). O id de despesa nova deixou de usar `crypto.randomUUID`, que não existe fora de HTTPS.
- **Sétima leva (25/10/2026): modos de pagamento e Configurações do split** (spec 04 e 06):
  - **Configurações do split** (`/s/:id/config`, `screens/SplitSettings.tsx`): Nome e capa, Como registrar pagamentos e Quem vê comprovantes (saiu de Pessoas). Abre pelo menu ⋯, pelo ⋯ da home e tocando na capa ou no nome do cabeçalho; membro vê só leitura. Cada mudança é otimista (`splitEdits` ganhou `payMode` e `proofVisibility`).
  - **Simplificado** (padrão; todo split sem `payMode` é simplificado): `markShare` e o comprovante de parte recusam com `mode-simple`; a aba Despesas mostra "sua parte" em cinza; o detalhe e o cartão do Meu saldo não têm botões por despesa; excluir despesa com parte paga é permitido, com o aviso "Isso muda o saldo de quem já acertou" (também ao editar).
  - **Detalhado:** `createPayment` marca as partes em aberto do par nos dois sentidos (`paid`, `via`, `pendConf` de quem pagou o acerto) e grava o acerto como recibo (`viaShares`, `covers`, `absorbs`), que o `@qpq/calc` não conta de novo; acertos antigos do par são incorporados (`absorbedBy`). Desfazer, "Não recebi" e Desfazer de uma parte paga no acerto desfazem o acerto inteiro (`functions/src/settle.ts`); Confirmar tira o "a conferir" das partes. No app, `data/settlements.ts` mostra tudo isso antes de o servidor responder.
  - **Trocar de modo** (`setPayMode`, só admin, split aberto): para o detalhado, cada par já quitado por acertos tem as partes marcadas no acerto mais recente do par.
- **Oitava leva (25/10/2026): incentivo ao Pix** (spec 03, 06 e 07):
  - "Quem é você?": seção "Sua chave Pix · recomendado" (opcional) logo abaixo de "Não estou na lista"; a chave vai para o perfil antes de entrar (`setPixKey`, depois `joinSplit`). Chave inválida não entra; quem já tem chave não vê a seção.
  - Meu saldo: quem tem a receber sem chave vê "Receba mais rápido: cadastre sua chave Pix", que abre a folha da chave (`PixSheet`); "Agora não" vale neste split, no aparelho.
  - "Pedir chave Pix" no cartão em que você deve (pessoa sem chave e já no split): Function `requestPix`, uma vez por split (`pixAsks` no split), aviso `pixRequested` para a pessoa (abre o Meu saldo com a folha). Ao cadastrar, `setPixKey` avisa quem pediu (`pixAdded`) e esconde os pedidos do sino (`functions/src/pix.ts`).

## 5. Ações que só o Lucas pode fazer

- **Antes da Fase 2:**
  - Reexportar o pacote do Claude Design com `support.js`.
  - Criar o repositório no GitHub e habilitar o Pages via Actions.
- **Antes da Fase 3:**
  - Criar os projetos Firebase staging e prod e fazer upgrade para Blaze, com alerta de orçamento.
  - `npm i -g firebase-tools && firebase login`.
  - Opcional: `claude plugin install firebase@firebase`.
- **Antes de publicar em produção:**
  - Publicar o Firebase Hosting do projeto de produção (`firebase deploy --only hosting,functions --project <prod>`), que serve os links curtos de convite. Se o app de produção não ficar em `lucasgualtieri.github.io/quem-paga-o-que/`, definir `APP_URL` nas Functions e `VITE_INVITE_HOST` no build.

## 6. Prompt de cada fase

```text
Implemente a Fase N de docs/plan.md.

Antes de codar, escreva os testes a partir de docs/spec/ e confirme que
falham. Depois implemente até passarem. Se a fase mexe em UI, abra o app
em 390 px e 1440 px, compare com reference/ e corrija as diferenças.

Se esbarrar num ponto em aberto, pare e pergunte.
No fim, mostre a saída dos testes e faça commit com mensagem descritiva.
```
