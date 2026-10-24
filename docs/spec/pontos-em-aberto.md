# Pontos em aberto

O protótipo não responde às perguntas abaixo. Quem implementar deve decidir com o Lucas antes de codar a parte afetada. Feche cada decisão antes da fase indicada (fases em `docs/plan.md`).

Os pontos de partida são sugestões para a conversa, não decisões tomadas. Ao decidir, registre a resposta aqui, mude o status para **Decidido** e atualize o arquivo da spec afetado, que é a fonte da verdade.

| # | Decisão | Fechar antes de | Ponto de partida sugerido | Status |
| --- | --- | --- | --- | --- |
| 1 | Ordem de distribuição dos centavos | Fase 1 | Ordem de entrada no split, gravada em cada participante | **Decidido** |
| 2 | Valor editado em despesa com partes pagas | Fase 1 | Guardar o valor pago, não só "pago"; a diferença volta a pendente | **Decidido** |
| 3 | Duas pessoas escolhem o mesmo nome em "Quem é você?" | Fase 3 | O nome trava para a primeira pessoa; um admin pode liberar | **Decidido** |
| 4 | Último admin sair ou deixar de ser admin | Fase 3 | Sempre ao menos um admin, como a spec sugere | **Decidido** |
| 5 | Convidado salva com conta Google que já existe no app (fora da spec) | Fase 4 | Entra na conta existente e oferece trazer os splits do aparelho | **Decidido** |
| 6 | Validade dos links de convite e de recuperação; como revogar | Fase 4 | Sem prazo; admin gera novo código, e o dono revoga o link de recuperação em Sua conta | **Decidido** |
| 7 | Excluir despesa com partes pagas ou pendência de confirmação; o que acontece com as notificações | Fase 5 | Bloquear até desmarcar os pagamentos, como em remover participante; nenhuma notificação fica órfã | **Decidido** |
| 8 | Duas pessoas editando a mesma despesa ao mesmo tempo | Fase 5 | Aviso de conflito por número de versão, em vez de "última gravação vence" | **Decidido** |
| 9 | Comprovantes: onde ficam, por quanto tempo e quem vê (LGPD) | Fase 6 | Só as duas pessoas do pagamento e os admins veem; retenção a definir com quem cuida de privacidade | **Decidido** |
| 10 | Provedor de e-mail transacional e remetente | Fase 7 | Resend com domínio próprio, chave em secret das Functions | **Decidido** (e-mail adiado até haver domínio) |
| 11 | De onde vem o nome de quem cria um split sem conta | Fase 3 | Campo "Seu nome" na tela Novo split | **Decidido** |
| 12 | Promover a admin quem ainda não entrou no split | Fase 3 | Só quem já escolheu o nome | **Decidido** |

## Respostas

### 1. Ordem de distribuição dos centavos — decidido em 22/10/2026

Cada participante recebe um `joinOrder` estável ao entrar no split. No modo Igualmente, os centavos que sobram vão 1 a 1 nessa ordem, nunca na ordem da lista da despesa. Em Frações e %, o empate no maior resto também desempata por `joinOrder`. O resultado é idêntico em todos os aparelhos. Spec atualizada: `02-modelo-de-dados-e-calculo.md` e `05-despesas-e-divisao.md`.

### 2. Valor editado em despesa com partes pagas — decidido em 22/10/2026

`paid[pessoa]` guarda os centavos pagos, não um booleano.
- Se a parte nova for maior que o pago, a diferença volta a ser pendente.
- Se for menor, o excedente vira crédito da pessoa com quem pagou a despesa.

Spec atualizada: `02-modelo-de-dados-e-calculo.md`.

### 3. Duas pessoas escolhem o mesmo nome — decidido em 22/10/2026

- **O nome trava para a primeira pessoa.** Em "Quem é você?", um nome já escolhido continua na lista, desabilitado, com "já entrou" (texto que o protótipo já tinha). Quem chega escolhe outro ou toca em "Não estou na lista".
- **Só admin libera.** Em Pessoas, o admin toca "Liberar nome" na linha da pessoa: o nome volta a ficar livre, e as despesas, partes e o histórico continuam com ele. Quem estava ligado ao nome deixa de ver o split. Liberar o nome também tira o admin daquele participante, para ninguém herdar o papel ao escolher o nome depois.
- **Nomes repetidos são bloqueados** no split, ao criar o split e em "Não estou na lista". A comparação ignora maiúsculas, acentos e espaços extras ("Lucas", "lúcas " e "LUCAS" são o mesmo nome). Mensagem: "Já tem alguém chamado Lucas aqui. Diferencie, ex.: Lucas G."

Spec atualizada: `03-contas-e-convidados.md` e `04-splits-papeis-permissoes.md`.

### 4. Último admin sair ou deixar de ser admin — decidido em 22/10/2026

- **Sempre ao menos um admin.** Um admin pode deixar de ser admin, ou sair do split, só se restar outro admin. O último fica travado, com a mensagem "Promova outra pessoa a admin antes".
- **"Sair do split" existe para todos** (membro e admin) e **desvincula**: o nome continua no split, com despesas e histórico intactos, e volta a ficar livre; quem saiu deixa de ver o split. **Só deixa sair com saldo zero** neste split ("Quite suas contas antes de sair"), para ninguém sair devendo.
- **Onde:** "Sair do split" fica no menu de três pontos do split; "Deixar de ser admin" fica na sua própria linha em Pessoas.
- **Único admin que perde o acesso** (convidado sem link de recuperação): nada de automático na v1. O lembrete de salvar a conta e o link de recuperação cobrem esse caso; os membros continuam usando o split, só sem convidar, promover ou finalizar.

Spec atualizada: `04-splits-papeis-permissoes.md`.

### 11. Nome de quem cria um split sem conta — decidido em 23/10/2026

Na tela Novo split, a sua linha da lista de participantes é um campo "Seu nome" (com "(você)" e o selo Admin). O nome fica salvo no perfil e vem preenchido nos próximos splits. Spec atualizada: `03-contas-e-convidados.md` e `04-splits-papeis-permissoes.md`.

### 12. Promover quem ainda não entrou — decidido em 23/10/2026

"Tornar admin" só aparece para quem já escolheu o nome no split. Evita que alguém com o link escolha um nome que já é admin. Spec atualizada: `04-splits-papeis-permissoes.md`.

### 5. Convidado salva com uma conta que já existe — decidido em 23/10/2026

Vale para Google e para e-mail.
- **Entra na conta existente e traz os splits do convidado.** Cada nome que o convidado tinha escolhido passa para a conta. Nada se perde.
- **Mesmo split dos dois lados** (a conta e o convidado com nomes diferentes no mesmo split): o app mostra os dois nomes daquele split e pergunta qual manter. O outro volta a ficar livre, com despesas e histórico intactos (como em "Liberar nome").
- **Admin:** se qualquer um dos dois nomes era admin, o nome que fica continua admin. A fusão nunca deixa um split sem admin.
- **Preferências:** valem as da conta; as do convidado neste aparelho são descartadas.
- Depois da fusão, a identidade de convidado deixa de existir e o link de recuperação dela para de valer.

Spec atualizada: `03-contas-e-convidados.md`.

### 6. Validade dos links de convite e de recuperação — decidido em 23/10/2026

- **Convite (link e código):** sem prazo. Em Pessoas, um admin toca "Gerar novo código"; uma folha confirma ("O link e o código atuais param de funcionar. Quem já entrou continua no split.") e o código antigo para na hora.
- **Link de recuperação:** sem prazo e pode ser usado mais de uma vez, até ser revogado. Em Sua conta dá para revogar; gerar um novo revoga o anterior.
- **Ao salvar a conta** (Google ou e-mail), o link de recuperação é revogado e a opção some de Sua conta: com login de verdade, um link sem senha vira só risco.

Spec atualizada: `03-contas-e-convidados.md` e `04-splits-papeis-permissoes.md`.

### 7. Excluir despesa com partes pagas — decidido em 23/10/2026

- **Bloqueia** enquanto houver parte paga ou pagamento esperando confirmação, como em remover participante: "Esta despesa tem pagamentos marcados. Desmarque-os antes de excluir." Ninguém perde o registro de que pagou.
- **Notificações da despesa somem da lista** quando ela é excluída; Desfazer traz de volta. Nenhuma fica órfã.

Spec atualizada: `05-despesas-e-divisao.md`.

### 8. Duas pessoas editando a mesma despesa — decidido em 23/10/2026

- Cada despesa tem um número de versão. Ao salvar, se outra pessoa salvou antes, aparece o aviso "Beatriz alterou esta despesa enquanto você editava." com **"Ver a versão nova"** (descarta a sua edição e abre a atual) ou **"Salvar a minha por cima"**. As duas edições entram no Histórico.
- Marcar parte paga, confirmar e anexar comprovante não contam como edição da despesa: não geram conflito e não se perdem quando alguém salva uma edição.

Spec atualizada: `05-despesas-e-divisao.md`.

### 9. Comprovantes e LGPD — decidido em 23/10/2026

- **Quem vê é escolha do split.** Em Pessoas, o admin escolhe "Quem vê comprovantes": **"Todo o split"** (padrão) ou **"Só os envolvidos e admins"** (quem pagou, quem recebeu e os admins). Membro vê a opção atual, só leitura. A troca vale na hora, inclusive para comprovantes já enviados. Quem não pode ver enxerga só "com comprovante", sem abrir a foto.
- **Prazo: no máximo 15 dias** a partir do envio, e **apagado assim que o split é finalizado** (reabrir não traz de volta). Também some quando o pagamento é desfeito ou contestado ("Não recebi"). Passado o prazo, a linha mostra "comprovante expirado" e não dá para enviar outro. A folha de anexar avisa: "Comprovantes ficam guardados por 15 dias."
- **Só imagem.** Foto ou print; o app reduz para no máximo 1600 px e regrava em JPEG de até 1 MB, o que tira os metadados (como a localização da câmera). O servidor aceita só imagem de até 2 MB.
- **Foto da despesa** (o comprovante em "Mais detalhes" do formulário, como uma nota fiscal): qualquer participante do split vê, independentemente da escolha acima. Mesmo prazo do comprovante de pagamento (15 dias, apagada ao finalizar).
- **Capa do split:** qualquer participante vê; fica enquanto o split existir. **Foto de perfil:** qualquer pessoa com login vê; fica até a pessoa trocar. Aparece no lugar da inicial em todos os avatares, para quem divide um split com a pessoa (24/10/2026).

Spec atualizada: `02-modelo-de-dados-e-calculo.md`, `04-splits-papeis-permissoes.md`, `05-despesas-e-divisao.md` e `06-saldo-pagamentos-comprovantes.md`.

### 10. Provedor de e-mail e remetente — decidido em 24/10/2026

- **Provedor: Resend**, chamado por uma Function, com a chave guardada em secret das Functions. Remetente num domínio próprio verificado (ex.: `avisos@<domínio>`).
- **Ainda não há domínio:** a v1 sai **só com notificações no app**. A opção "Por e-mail" fica escondida em Sua conta até o domínio existir e ser verificado; a preferência `email` continua guardada.
- **Quando o e-mail entrar:** cada aviso vira e-mail, mas avisos para a mesma pessoa em até 10 minutos saem juntos num só ("3 pagamentos para conferir").
- **Conteúdo:** resumo ("Beatriz pagou R$ 40,00 pra você", despesa e split) e um botão "Ver no app" que abre o detalhe como quem chega pela notificação. **Sem a foto do comprovante** (ela fica sob "Quem vê comprovantes" e o prazo de 15 dias). Idioma da conta; rodapé dizendo como desligar em Sua conta. Convidado não recebe e-mail.

Spec atualizada: `07-notificacoes.md` e `08-sua-conta-e-preferencias.md`.

### 4 (revista). Último admin sai ou deixa de ser admin — 24/10/2026

Substitui o "último fica travado" da decisão 4. O último admin pode sair (com saldo zero) ou deixar de ser admin: o papel passa para quem tem a menor ordem de entrada entre os que já escolheram o nome, e a folha avisa antes. Sem ninguém para herdar, o split fica sem admin e a próxima pessoa que entrar e escolher um nome vira admin. Spec atualizada: `04-splits-papeis-permissoes.md`.
