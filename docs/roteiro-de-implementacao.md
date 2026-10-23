# Quem Paga O Quê? — roteiro de implementação com Claude Code

Oct 22, 2026 · @Lucas Gualtieri

## Por que um prompt só não basta

Nem um prompt bom nem um passo a passo bastam sozinhos. Um prompt vive dentro de uma sessão, e o contexto de uma sessão se esgota depressa, com a qualidade caindo perto do limite. Sem uma checagem que o Claude rode sozinho, quem pega cada erro é quem acompanha.

O que funciona é o inverso:

- O contexto mora no repositório, não no prompt: spec em Markdown, referência visual, plano e um CLAUDE.md curto.
- O trabalho anda em fases pequenas, uma por sessão.
- Cada fase tem uma checagem que o Claude roda para saber se terminou: testes, regras no emulador, screenshot comparado ao protótipo.

A spec já resolve a parte mais difícil. Segundo a [documentação do Claude Code](https://code.claude.com/docs/en/best-practices), as specs mais úteis dizem o que fica fora do escopo e fecham com uma verificação de ponta a ponta. A seção “Andaime do protótipo” cumpre a primeira metade; este roteiro cuida da segunda.

## Roteiro em sete passos

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

## Ferramentas

Cinco ferramentas fecham o ciclo de verificação dos passos 1 e 6. Sem elas, quem verifica é você.

| Ferramenta | Para quê | Como |
| --- | --- | --- |
| [Handoff do Claude Design](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux) | Levar o protótipo para o repositório | Export → Hand off to Claude Code gera um pacote com os arquivos do design, a conversa e um README. Baixe-o para `reference/` em vez de colar o prompt pronto: o protótipo é andaime e o back-end não está nele. |
| [Claude Code com Chrome](https://code.claude.com/docs/en/chrome) | Comparar a tela com o protótipo | `claude --chrome`, ou `/chrome` numa sessão aberta. Exige a extensão Claude in Chrome e um plano Pro, Max, Team ou Enterprise. |
| Playwright | Checagens que se repetem a cada fase | Testes de ponta a ponta e screenshots em 390 px e 1440 px, rodando também no CI. |
| [Plugin do Firebase](https://firebase.google.com/docs/ai-assistance/mcp-server) | Projeto, regras e deploy pelo agente | `claude plugin marketplace add firebase/firebase-tools` e depois `claude plugin install firebase@firebase`. Usa as credenciais do Firebase CLI, então deixe o projeto de staging ativo. |
| [Hooks](https://code.claude.com/docs/en/best-practices) | Typecheck e testes depois de cada edição | Peça ao próprio Claude: “escreva um hook que rode typecheck e testes depois de cada edição”. |

O servidor MCP do Firebase também traz um prompt pronto que gera regras do Firestore com testes unitários, útil na Fase 3.

## O que conferir no plano

O plano do Claude Code precisa resolver os pontos abaixo, que um prompt único costuma deixar passar.

Para o front, o caminho natural é uma SPA estática em React, TypeScript e Vite. Os tokens da Folha de estilo viram variáveis CSS, e um workflow do GitHub Actions publica no Pages. Outra escolha bem justificada também serve.

### Contas

- Convidado = login anônimo do Firebase. “Salvar conta depois” = vincular uma credencial (Google ou e-mail) ao mesmo usuário, o que preserva o UID: o “nada é recriado” da spec sai quase de graça.
- Caso fora da spec: o convidado tenta salvar com uma conta Google que já existe no app. O vínculo falha, e é preciso decidir se as contas se fundem.
- O link de recuperação não tem equivalente pronto: precisa de uma Cloud Function que troque um token secreto por um login.
- Google por popup, não por redirecionamento. Fora do Firebase Hosting, o redirecionamento falha no Chrome 115+, Firefox 109+ e Safari 16.1+, que bloqueiam armazenamento de terceiros ([Firebase](https://firebase.google.com/docs/auth/web/redirect-best-practices)).
- A mesma página avisa que popup é menos fluido no celular. Se incomodar, a opção 5 dela faz o login do Google por fora e troca a credencial no Firebase.

### Custo e hospedagem

- Cloud Functions (no mínimo link de recuperação e e-mails) e Storage (capas e comprovantes) exigem o plano Blaze. No Storage, a exigência vale desde 3 de fevereiro de 2026, e o Blaze mantém uma faixa sem custo ([Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).
- Essa faixa grátis de buckets novos só vale em US-CENTRAL1, US-EAST1 e US-WEST1; um bucket em São Paulo não tem.
- Cadastre o cartão com alerta de orçamento; o próprio fluxo de upgrade sugere criar um.
- O GitHub Pages não tem fallback de rotas para SPA: um link de convite com caminho próprio dá 404 se as rotas não usarem `#` (ou o truque do `404.html`).
- O produto é web, e pela spec o Push só existe no app nativo. Na v1, notificação é no app e por e-mail.

### Dados e permissões

- Na spec, participantes são nomes; as regras do Firestore só enxergam UIDs. Cada participante precisa de um id e do vínculo com o UID de quem se escolheu em “Quem é você?”.
- “Permissão no servidor” = Security Rules, mais Cloud Functions para o que regra não alcança, como só remover participante com saldo zero.
- O pagamento otimista vem pronto: o Firestore aplica a escrita local na hora e sincroniza depois.

## Fases e decisões

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

## Modelo de CLAUDE.md

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

## Prompts

Dois prompts cobrem o projeto: um para o plano, em plan mode, e um modelo para cada fase.

### Primeira sessão (plan mode)

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

### Cada fase seguinte

```text
Implemente a Fase N de docs/plan.md.

Antes de codar, escreva os testes a partir de docs/spec/ e confirme que
falham. Depois implemente até passarem. Se a fase mexe em UI, abra o app
em 390 px e 1440 px, compare com reference/ e corrija as diferenças.

Se esbarrar num ponto em aberto, pare e pergunte.
No fim, mostre a saída dos testes e faça commit com mensagem descritiva.
```

Use o vocabulário da spec: “split”, não “rolê” nem “sessão”. Duas palavras para a mesma coisa podem virar duas entidades no código.

## Referências

Páginas consultadas em 22 de outubro de 2026, além da spec “Quem Paga O Quê? — especificação para implementação”.

- [Claude Code: Best practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code: Use Claude Code with Chrome](https://code.claude.com/docs/en/chrome)
- [Claude Design: protótipos e handoff para o Claude Code](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux)
- [Firebase: servidor MCP e plugin para Claude Code](https://firebase.google.com/docs/ai-assistance/mcp-server)
- [Firebase: signInWithRedirect em navegadores que bloqueiam armazenamento de terceiros](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase: Cloud Storage e o plano Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
