# Quem Paga O Quê? — handoff para uma nova conversa

Atualizado em 24/10/2026, ao fim da Fase 8 — todas as fases do plano concluídas (branch `main`). Leia este arquivo primeiro; ele aponta para o resto.

## Como começar a nova conversa

Abra o Claude Code na pasta do projeto e cole:

```text
Leia docs/handoff.md, CLAUDE.md e docs/plan.md. As 8 fases estão concluídas.
Próximo passo: preparar o lançamento (ver "O que falta para ir ao ar"). Se esbarrar
num ponto em aberto, me entreviste antes.
```

## O produto

Web app de divisão de despesas em grupo ("Quem Paga O Quê?"). Front estático (React + Vite) no GitHub Pages, back-end no Firebase. Conta é opcional: qualquer pessoa usa o app como convidado (login anônimo) e pode salvar a conta depois.

- Repositório local: `/Users/lucasgualtieri/Desktop/Lucas/quem_paga_o_que`
- GitHub: `git@github.com:LucasGualtieri/quem-paga-o-que.git` (público; branch `main`)
- App publicado: https://lucasgualtieri.github.io/quem-paga-o-que/ (Pages, via GitHub Actions a cada push na `main`)
- Firebase de testes: projeto `qpq-staging` (alias `staging` em `.firebaserc`), tudo em `us-east1`. Ainda **não existe projeto de produção**.
- Autor: Lucas Gualtieri (fala português; responda em português).

## Os documentos que mandam

| Documento | Para quê |
| --- | --- |
| `docs/spec/` (README.md + 00…10 + `pontos-em-aberto.md`) | **Fonte da verdade das regras.** Divergência entre spec e código: corrija a spec primeiro. |
| `reference/` (protótipo do Claude Design) | **Fonte da verdade visual.** O código do protótipo é referência de layout e comportamento, não de arquitetura. `support.js` não vai para o app. |
| `docs/plan.md` | Stack, modelo de dados, tabela de permissões, 8 fases com status e notas de implementação. |
| `CLAUDE.md` | Regras inegociáveis e comandos (carregado em toda sessão). |
| `docs/roteiro-de-implementacao.md` | O roteiro original que gerou esta metodologia (cópia do arquivo da pasta Downloads, conteúdo abaixo). |

## Estado das fases

| Fase | O quê | Status |
| --- | --- | --- |
| 1 | Motor de cálculo `packages/calc` (centavos, 100% de cobertura) | ✅ |
| 2 | Fundação do app, componentes da Folha de estilo, paleta editável, CI e Pages | ✅ |
| 3 | Splits, convite, "Quem é você?", Pessoas, permissões no servidor | ✅ |
| 4 | Contas: entrada, e-mail/Google, link de recuperação, fusão com conta existente, Sua conta | ✅ |
| 5 | Despesas: formulário, 5 modos de divisão, itens, Transações, detalhe, editar/excluir, conflito de edição | ✅ (CI verde, Functions no staging) |
| 6 | Saldo, Minha visão, marcar pago/Recebi, confirmar/"Não recebi", acertos, comprovantes (Storage), capa e foto de perfil | ✅ (CI verde, Functions e Storage no staging) |
| 7 | Notificações no app (4 eventos, sino, lista, banner pelo aviso) | ✅ (e-mail adiado: decisão 10) |
| 8 | Finalizar/reabrir, home completa, acessibilidade (axe); desktop = mesma UI do celular | ✅ (falta revisão manual no celular) |
| — | Ajustes finos (24/10/2026): último admin sai, chave Pix, ícone/emoji, Minha visão por pessoa no lugar da aba Saldo, confirmação de acerto, "Ver como" do admin; foto nos avatares, valor como caixa eletrônico, excluir split e split vazio apagado em 15 dias; Meu saldo, vermelho do escuro, convite com nome, Ajustar foto, capa com ícone/emoji | ✅ (ver plan.md) |

### Decisões (docs/spec/pontos-em-aberto.md)

Decididas (1–10): centavos pela ordem de entrada (`joinOrder`); `paid[pessoa]` guarda centavos pagos; nome escolhido trava e só admin libera; sempre ao menos um admin e "Sair do split" só com saldo zero; convidado que salva com conta existente entra nela e traz os splits (pergunta qual nome manter quando há dois no mesmo split, nome que fica herda admin); convite sem prazo e admin gera código novo; link de recuperação sem prazo, reutilizável até revogar e revogado ao salvar a conta; excluir despesa com parte paga é bloqueado, notificações da despesa excluída somem; edição simultânea avisa por versão ("Ver a versão nova" / "Salvar a minha por cima"); comprovantes: quem vê é escolha do split em Pessoas (padrão "Todo o split", ou "Só os envolvidos e admins"), guardados no máximo 15 dias e apagados ao finalizar, só imagem recomprimida no aparelho; e-mail por Resend, agrupado em 10 minutos, sem foto, **adiado até existir domínio** (a opção fica escondida). Detalhes e textos exatos estão na spec.

**Em aberto:** nenhuma. Para ligar o e-mail: comprar o domínio, verificar no Resend, guardar a chave em secret das Functions e implementar o envio agrupado (spec 07 e decisão 10).

## Como o código está organizado

```text
packages/calc/     motor de partes e saldos (TypeScript puro; shares, validateExpense, ledger)
packages/shared/   nomes (nameKey), convite, tags, Pix (pix.ts), ícones (icons.ts), contrato das Functions (api.ts)
functions/         Cloud Functions chamáveis (us-east1, esbuild)
  src/splits.ts    createSplit, previewInvite, joinSplit, setAdmin, releaseName, leaveSplit, removeMember, regenerateCode,
                   finalizeSplit, reopenSplit
  src/accounts.ts  createRecoveryLink, revokeRecovery, redeemRecovery, prepareMerge, previewMerge, mergeGuest, setPixKey, setProfilePhoto
  src/expenses.ts  createExpense, updateExpense, deleteExpense, restoreExpense
  src/payments.ts  markShare, unmarkShare, confirmShare, disputeShare, createPayment, deletePayment,
                   confirmPayment, disputePayment,
                   attachProof, setReceipt, setSplitPhoto, setProofVisibility
  src/proofs.ts    prazo de 15 dias dos comprovantes (purgeProofs, rotina diária)
  src/deletion.ts  deleteSplit e purgeEmptySplits (split sem ninguém há 15 dias)
  src/invitePage.ts  página do link curto de convite (Firebase Hosting, /c/ABC-123)
  src/notifications.ts  avisos criados e atualizados pelas Functions de pagamento
  src/common.ts    ajudantes (db(), fail(), isGuest()…)
apps/web/          SPA (React 19 + Vite + HashRouter)
  src/theme/tokens.css   ÚNICA fonte de cor (um teste falha se houver cor em outro arquivo)
  src/components/        componentes da Folha de estilo
  src/data/              Firebase, hooks em tempo real, modelo, lógica pura do formulário, store otimista
  src/screens/           telas do produto; src/dev/ telas de revisão
  e2e/                   Playwright (390 e 1440 px)
firestore.rules, storage.rules (lê o split no Firestore), storage.cors.json, firebase.json, .firebaserc
```

Conceitos que não são óbvios:
- **Escrita só por Functions** para `splits` (participantes e papéis), `expenses` (inclusive partes pagas) e `payments`: as regras negam escrita direta. Perfil/preferências (`users/{uid}`) o próprio dono grava, com validação nas regras.
- **Saldo nunca é guardado**: sai de `expenses` (sem as com `deletedAt`) e `payments` pelo `@qpq/calc`.
- **Participante ≠ usuário**: `members[memberId]` tem `uid` (ou `null` se ainda não entrou); `uids` e `adminUids` são espelhos mantidos pelas Functions.
- **UX otimista em tudo**: `lib/optimistic.ts` (`useOptimisticValue`/`useOptimisticAction`), `data/expenseStore.ts` para edições de despesa (fila por despesa, conflito de edição) e `data/payStore.ts` para pagamentos, acertos e comprovantes (saem quando o snapshot alcança `paySeq`). Se o servidor recusar, volta com toast.
- **Convidado** = sem credencial ligada (`identities` vazio no token), inclusive quem volta pelo link de recuperação.
- Pagamento de parte não é edição: não mexe em `version` (decisão 8), sobe `paySeq`. Comprovante = `{path, at, by}`; `path: null` = expirou (não aceita outro).
- Fotos: leitura sempre por `getBlob` (passa pelas regras do Storage), nunca por link público; envio já reduzido (`lib/image.ts`) e por caminho que diz de quem é (`splits/{id}/proofs/{from}/{to}/…`).

## O que falta para ir ao ar

- **Revisão manual** no iPhone e no Android pelo link do Pages (o Lucas): fluxo completo com duas pessoas, foto de comprovante pela câmera, tema escuro.
- **Projeto de produção** (o Lucas cria; o Claude orienta): Blaze, us-east1, alerta de orçamento, alias `prod` no `.firebaserc`, provedores de login (e-mail, Google) e domínio autorizado, papel "Criador de token da conta de serviço" (link de recuperação), Storage em us-east1 com o CORS de `storage.cors.json` e o papel `roles/firebaserules.firestoreServiceAgent` para a conta de serviço do Storage. Variáveis `VITE_FIREBASE_*` do projeto de produção no repositório (ou num ambiente do GitHub).
- **Desligar as telas de revisão**: tirar `VITE_DEV_TOOLS: true` do workflow do Pages.
- **E-mail** (opcional, decisão 10): domínio, Resend e o envio agrupado; até lá, só notificações no app.
- Revisar os "Textos novos fora do protótipo" listados em cada fase do `docs/plan.md`.

## Preferências do Lucas (aprenda com elas)

- Responder em **português**. Ele quer ser **entrevistado** (AskUserQuestion, opções com a recomendada primeiro) para fechar cada decisão em aberto, e as respostas viram spec + plano + commit.
- **UX otimista em toda ação** (regra do CLAUDE.md): assume sucesso, volta com toast se o servidor recusar. A região `us-east1` foi escolhida sabendo da latência; o otimismo compensa.
- **Paleta ainda pode mudar**: toda cor só em `tokens.css`; tela `/#/dev/paleta` edita ao vivo, mede contraste AA e "Copiar CSS". Ao aprovar paleta nova, atualizar a tabela de tokens em `docs/spec/09-…` (um teste confere).
- Cada fase: testes primeiro, implementar, comparar com o protótipo (screenshots 390 e 1440 px), atualizar spec/plano, commit, push, conferir CI, e para backend publicar no staging.
- Commits terminam com `Co-Authored-By: Claude … <noreply@anthropic.com>`.
- Textos novos que não existem no protótipo são listados no plano ("Textos novos… revisar").

## Comandos e armadilhas

```bash
npm install
npm run typecheck && npm test        # unidade (calc 100%)
npm run test:emulators               # regras + Functions (sobe os emuladores; Java 21+)
npm run e2e                          # Playwright contra os emuladores (feche emuladores já abertos antes)
npm run dev                          # http://localhost:5173 (telas de revisão em /#/dev)
npm run emulators
node scripts/serve-reference.mjs     # protótipo em http://localhost:8000 (precisa de internet: React via CDN)
npm run deploy:staging               # regras + Functions em qpq-staging
```

- **Function nova no staging: rode o deploy duas vezes.** Na criação o Cloud Run não recebe o invoker público (401 em HTML); a atualização aplica. Confira com um POST sem login: tem que responder JSON `UNAUTHENTICATED`, não HTML.
- Nunca publique em produção. Trabalhe contra emuladores e staging.
- O Python do macOS não lê a pasta do Desktop; use o servidor Node do protótipo.
- O Pages publica com as **telas de revisão ligadas** (`VITE_DEV_TOOLS=true` no workflow) até o lançamento; desligar antes de lançar. A configuração do Firebase do app vem de variáveis do repositório (`VITE_FIREBASE_*`).
- Os logs do emulador de Functions poluem o `npm run e2e`; filtre com `grep -v '^>'`.
- Com muitos testes em paralelo o emulador de Functions fica lento e o e2e falha por tempo; numa máquina com muitos núcleos, rode com poucos workers: `npx firebase emulators:exec --only auth,firestore,functions,storage --project demo-qpq "npm run e2e -w @qpq/web -- --workers=2"`.
- `npm audit` acusa alertas só em `firebase-tools` (CLI de desenvolvimento).
- O hook em `.claude/settings.json` roda typecheck e testes depois de cada edição de código.
- Dados de teste no staging (contas e splits de teste) podem existir; não são dados reais.

## Configuração do staging (já feita pelo Lucas)

E-mail/senha e Google ligados (nome público "Quem Paga O Quê? (staging)"); domínio `lucasgualtieri.github.io` autorizado; a conta de serviço padrão do Compute tem "Criador de token da conta de serviço" (sem isso `redeemRecovery` dá 500). Mudanças de segurança do console (IAM, domínios, provedores) **precisam do OK explícito do Lucas**: o Claude explica exatamente o que será concedido e só faz depois do sim (foi assim com o papel do Storage). No Cloud Shell pelo navegador do app, texto colado não chega ao terminal: digite tecla por tecla (símbolos literais funcionam).

## Pendências e riscos conhecidos

- **Storage do staging configurado em 23/10/2026:** bucket `qpq-staging.firebasestorage.app` (us-east1, criado pelo console), CORS de `storage.cors.json` aplicado pelo Cloud Shell, regras publicadas e o papel `roles/firebaserules.firestoreServiceAgent` dado à conta de serviço do Storage (`service-419882001563@gcp-sa-firebasestorage.iam.gserviceaccount.com`), sem o qual toda regra que lê o split no Firestore recusa. Verificado no staging: envio e leitura de capa, PDF recusado, CORS só para o Pages e localhost. O deploy em modo não interativo **não** pede esse papel: num projeto novo (produção), conceder antes. Ficou um split "Teste Storage" de um convidado (dado de teste).
- As Fases 5 e 6 foram verificadas nos emuladores (e2e em 390 e 1440 px), mas despesas e pagamentos **ainda não foram testados à mão no app publicado**.
- Desktop usa a mesma UI do celular (coluna de até 560 px). O layout de duas colunas foi descartado (spec 10); não reintroduzir sem nova decisão.
- E-mail de notificação: decidido (Resend, decisão 10), mas só entra quando houver domínio de remetente; até lá a opção fica escondida (`EMAIL_CHANNEL` em `Account.tsx`).

---

# Anexo: roteiro de implementação original

(Cópia de `docs/roteiro-de-implementacao.md`, o arquivo que estava em Downloads. Mantido como referência da metodologia: contexto no repositório, uma fase por sessão, cada fase com uma checagem que o Claude roda, decisões pendentes fechadas por entrevista.)

## Quem Paga O Quê? — roteiro de implementação com Claude Code

Oct 22, 2026 · @Lucas Gualtieri

### Por que um prompt só não basta

Nem um prompt bom nem um passo a passo bastam sozinhos. Um prompt vive dentro de uma sessão, e o contexto de uma sessão se esgota depressa, com a qualidade caindo perto do limite. Sem uma checagem que o Claude rode sozinho, quem pega cada erro é quem acompanha.

O que funciona é o inverso:

- O contexto mora no repositório, não no prompt: spec em Markdown, referência visual, plano e um CLAUDE.md curto.
- O trabalho anda em fases pequenas, uma por sessão.
- Cada fase tem uma checagem que o Claude roda para saber se terminou: testes, regras no emulador, screenshot comparado ao protótipo.

A spec já resolve a parte mais difícil. Segundo a [documentação do Claude Code](https://code.claude.com/docs/en/best-practices), as specs mais úteis dizem o que fica fora do escopo e fecham com uma verificação de ponta a ponta. A seção “Andaime do protótipo” cumpre a primeira metade; este roteiro cuida da segunda.

### Roteiro em sete passos

Sete passos levam da spec ao app publicado: o Claude Code escreve o plano, e quem decide o produto aprova.

1. **Leve tudo para o repositório.** Converta o PDF da spec em Markdown, um arquivo por seção em `docs/spec/`. O agente busca em texto muito melhor que em PDF, e cada mudança de regra fica versionada. O protótipo do Claude Design vai para `reference/`, como consulta visual e nunca como base de código.
2. **Peça um plano antes do código.** Abra o Claude Code em plan mode (Shift+Tab) com o prompt da seção Prompts. Ele devolve stack, modelo de dados, estratégia de permissões, fases com critério de pronto e perguntas. Corrija até concordar (Ctrl+G abre o plano no editor) e salve em `docs/plan.md`.
3. **Escreva um CLAUDE.md curto.** É o arquivo que o Claude Code carrega em toda sessão, então só entra o que evita erro. Aponte para `docs/` em vez de colar a spec: num arquivo inchado, a regra importante se perde. Há um modelo na seção Modelo de CLAUDE.md.
4. **Comece pelo cálculo, com testes antes.** O motor de saldos vira um módulo TypeScript puro, sem tela, compartilhado entre o app e as Cloud Functions. Os testes vêm primeiro, tirados dos exemplos da spec: pizza 2, 1, 3, 2; centavos distribuídos 1 a 1; porcentagem que soma 100%; itens com resto; acertos abatendo dívida. É aqui que um bug vira dinheiro errado.
5. **Depois, uma fase por sessão.** Siga a ordem desenhada em Fases e decisões. Cada fase começa com `/clear` e termina com testes passando e commit. Antes de uma fase travada por um ponto em aberto, peça que o Claude entreviste você sobre ele.
6. **Dê olhos ao agente.** Sem ver a tela, ele implementa o layout às cegas e declara pronto. Ele precisa abrir o app em 390 px e 1440 px, comparar com as galerias Telas 1–5 e corrigir as diferenças. Typecheck e testes depois de cada edição vão num hook, que roda sem depender de memória.
7. **Revise como produto.** Teste cada fase num iPhone e num Android pelo link publicado. Achou divergência: corrija primeiro a spec, que é a fonte da verdade, e só então peça o ajuste. Erro que se repete vira linha no CLAUDE.md.

Estrutura de pastas sugerida:

```text
docs/
  spec/                     a spec em Markdown, um arquivo por seção
  spec/pontos-em-aberto.md  decisões pendentes e respostas
  plan.md                   gerado no passo 2
reference/                  pacote do Claude Design, só leitura
CLAUDE.md
```

O agente trabalha contra os emuladores e um projeto de staging, nunca contra o Firebase de produção.

### Ferramentas

Cinco ferramentas fecham o ciclo de verificação dos passos 1 e 6. Sem elas, quem verifica é você.

| Ferramenta | Para quê | Como |
| --- | --- | --- |
| [Handoff do Claude Design](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux) | Levar o protótipo para o repositório | Export → Hand off to Claude Code gera um pacote com os arquivos do design, a conversa e um README. Baixe-o para `reference/` em vez de colar o prompt pronto: o protótipo é andaime e o back-end não está nele. |
| [Claude Code com Chrome](https://code.claude.com/docs/en/chrome) | Comparar a tela com o protótipo | `claude --chrome`, ou `/chrome` numa sessão aberta. Exige a extensão Claude in Chrome e um plano Pro, Max, Team ou Enterprise. |
| Playwright | Checagens que se repetem a cada fase | Testes de ponta a ponta e screenshots em 390 px e 1440 px, rodando também no CI. |
| [Plugin do Firebase](https://firebase.google.com/docs/ai-assistance/mcp-server) | Projeto, regras e deploy pelo agente | `claude plugin marketplace add firebase/firebase-tools` e depois `claude plugin install firebase@firebase`. Usa as credenciais do Firebase CLI, então deixe o projeto de staging ativo. |
| [Hooks](https://code.claude.com/docs/en/best-practices) | Typecheck e testes depois de cada edição | Peça ao próprio Claude: “escreva um hook que rode typecheck e testes depois de cada edição”. |

O servidor MCP do Firebase também traz um prompt pronto que gera regras do Firestore com testes unitários, útil na Fase 3.

### O que conferir no plano

O plano do Claude Code precisa resolver os pontos abaixo, que um prompt único costuma deixar passar.

Para o front, o caminho natural é uma SPA estática em React, TypeScript e Vite. Os tokens da Folha de estilo viram variáveis CSS, e um workflow do GitHub Actions publica no Pages. Outra escolha bem justificada também serve.

#### Contas

- Convidado = login anônimo do Firebase. “Salvar conta depois” = vincular uma credencial (Google ou e-mail) ao mesmo usuário, o que preserva o UID: o “nada é recriado” da spec sai quase de graça.
- Caso fora da spec: o convidado tenta salvar com uma conta Google que já existe no app. O vínculo falha, e é preciso decidir se as contas se fundem.
- O link de recuperação não tem equivalente pronto: precisa de uma Cloud Function que troque um token secreto por um login.
- Google por popup, não por redirecionamento. Fora do Firebase Hosting, o redirecionamento falha no Chrome 115+, Firefox 109+ e Safari 16.1+, que bloqueiam armazenamento de terceiros ([Firebase](https://firebase.google.com/docs/auth/web/redirect-best-practices)).
- A mesma página avisa que popup é menos fluido no celular. Se incomodar, a opção 5 dela faz o login do Google por fora e troca a credencial no Firebase.

#### Custo e hospedagem

- Cloud Functions (no mínimo link de recuperação e e-mails) e Storage (capas e comprovantes) exigem o plano Blaze. No Storage, a exigência vale desde 3 de fevereiro de 2026, e o Blaze mantém uma faixa sem custo ([Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).
- Essa faixa grátis de buckets novos só vale em US-CENTRAL1, US-EAST1 e US-WEST1; um bucket em São Paulo não tem.
- Cadastre o cartão com alerta de orçamento; o próprio fluxo de upgrade sugere criar um.
- O GitHub Pages não tem fallback de rotas para SPA: um link de convite com caminho próprio dá 404 se as rotas não usarem `#` (ou o truque do `404.html`).
- O produto é web, e pela spec o Push só existe no app nativo. Na v1, notificação é no app e por e-mail.

#### Dados e permissões

- Na spec, participantes são nomes; as regras do Firestore só enxergam UIDs. Cada participante precisa de um id e do vínculo com o UID de quem se escolheu em “Quem é você?”.
- “Permissão no servidor” = Security Rules, mais Cloud Functions para o que regra não alcança, como só remover participante com saldo zero.
- O pagamento otimista vem pronto: o Firestore aplica a escrita local na hora e sincroniza depois.

### Fases e decisões

Oito fases levam do cálculo ao desktop, e nove decisões em aberto travam cinco delas. Feche cada decisão antes da fase indicada.

&#91;embedded content: fases e decisões · 8 fases, 9 decisões em aberto\]

Cada losango marca onde as decisões ao lado precisam estar fechadas; a tabela guarda o ponto de partida e o status de cada uma.

| Decisão em aberto | Fechar antes de | Ponto de partida sugerido | Status |
| --- | --- | --- | --- |
| Ordem de distribuição dos centavos | Fase 1 | Ordem de entrada no split, gravada em cada participante | Em aberto |
| Valor editado em despesa com partes pagas | Fase 1 | Guardar o valor pago, não só “pago”; a diferença volta a pendente. Muda o modelo de dados | Em aberto |
| Duas pessoas escolhem o mesmo nome | Fase 3 | O nome trava para a primeira pessoa; um admin pode liberar | Em aberto |
| Último admin sair ou deixar de ser admin | Fase 3 | Sempre ao menos um admin, como a spec sugere | Em aberto |
| Convidado salva com conta Google que já existe (fora da spec) | Fase 4 | Entra na conta existente e oferece trazer os splits do aparelho | Em aberto |
| Validade dos links de convite e de recuperação | Fase 4 | Sem prazo; admin gera novo código, e o dono revoga o link de recuperação em Sua conta | Em aberto |
| Excluir despesa com partes pagas ou pendência | Fase 5 | Bloquear até desmarcar os pagamentos, como em remover participante; nenhuma notificação fica órfã | Em aberto |
| Duas pessoas editando a mesma despesa | Fase 5 | Aviso de conflito por número de versão, em vez de “última gravação vence” | Em aberto |
| Comprovantes: onde ficam, por quanto tempo e quem vê (LGPD) | Fase 6 | Só as duas pessoas do pagamento e os admins veem; retenção a definir com quem cuida de privacidade | Em aberto |

Os pontos de partida são sugestões para a conversa, não decisões tomadas.

### Modelo de CLAUDE.md

Um ponto de partida para a raiz do repositório; os comandos entram depois que o plano for aprovado. É curto de propósito, porque cada linha a mais dilui as outras.

```markdown
# Quem Paga O Quê?

Web app de divisão de despesas em grupo. Front estático no GitHub Pages, back-end no Firebase.

## Onde está cada coisa
- Regras do produto: docs/spec/ (fonte da verdade das regras)
- Visual: reference/ (fonte da verdade visual; o código do protótipo é
  referência de layout e comportamento, não de arquitetura)
- Plano e fases: docs/plan.md
- Decisões pendentes: docs/spec/pontos-em-aberto.md

## Comandos
<!-- preencher depois do plano aprovado -->
- dev:
- testes:
- emuladores:

## Regras inegociáveis
- Valores sempre em centavos inteiros; só a tela formata em R$.
- Saldo nunca é guardado: é calculado das despesas e pagamentos,
  sempre pelo módulo de cálculo compartilhado.
- Toda permissão vale no servidor (Security Rules ou Cloud Functions),
  nunca só na tela. Mudou uma regra? Atualize os testes de regras.
- Nada da seção "Andaime do protótipo" entra no produto.
- Cores só por tokens (variáveis CSS), nunca hex no componente.
- Todo texto passa pelo i18n: PT-BR padrão, EN completo.
- Vocabulário da spec: split, despesa, parte, acerto.
- IMPORTANT: se a tarefa esbarrar num ponto em aberto, pare e pergunte.
  Não invente regra.

## Fluxo
- Trabalhe contra os emuladores, nunca contra o projeto de produção.
- Termine cada tarefa com typecheck e testes passando e mostre a saída.
- Mudou a UI? Screenshot em 390 px e 1440 px comparado com reference/.
```

### Prompts

Dois prompts cobrem o projeto: um para o plano, em plan mode, e um modelo para cada fase.

#### Primeira sessão (plan mode)

```text
Leia o CLAUDE.md, docs/spec/ (fonte da verdade das regras) e reference/
(fonte da verdade visual; o código do protótipo é referência de layout e
comportamento, não de arquitetura).

Ainda não escreva código. Monte um plano em docs/plan.md com:

1. Stack para front estático no GitHub Pages e back-end no Firebase, com o
   motivo de cada escolha e o que exige o plano Blaze.
2. Modelo de dados no Firestore: o que é guardado, o que é sempre
   calculado e como um participante (nome) se liga a um usuário (UID).
3. Para cada linha da tabela "Splits, papéis e permissões": se será
   garantida por Security Rules ou Cloud Function, e como será testada.
4. Fases pequenas, cada uma com critério de pronto verificável: testes,
   regras no emulador, screenshot em 390 px e 1440 px.
5. Perguntas para mim sobre tudo que estiver ambíguo, contraditório ou
   depender de docs/spec/pontos-em-aberto.md. Pergunte, não suponha.

Nada da seção "Andaime do protótipo" entra no produto.
```

#### Cada fase seguinte

```text
Implemente a Fase N de docs/plan.md.

Antes de codar, escreva os testes a partir de docs/spec/ e confirme que
falham. Depois implemente até passarem. Se a fase mexe em UI, abra o app
em 390 px e 1440 px, compare com reference/ e corrija as diferenças.

Se esbarrar num ponto em aberto, pare e pergunte.
No fim, mostre a saída dos testes e faça commit com mensagem descritiva.
```

Use o vocabulário da spec: “split”, não “rolê” nem “sessão”. Duas palavras para a mesma coisa podem virar duas entidades no código.

### Referências

Páginas consultadas em 22 de outubro de 2026, além da spec “Quem Paga O Quê? — especificação para implementação”.

- [Claude Code: Best practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code: Use Claude Code with Chrome](https://code.claude.com/docs/en/chrome)
- [Claude Design: protótipos e handoff para o Claude Code](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux)
- [Firebase: servidor MCP e plugin para Claude Code](https://firebase.google.com/docs/ai-assistance/mcp-server)
- [Firebase: signInWithRedirect em navegadores que bloqueiam armazenamento de terceiros](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase: Cloud Storage e o plano Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
