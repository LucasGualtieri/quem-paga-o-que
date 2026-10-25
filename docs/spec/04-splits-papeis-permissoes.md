# Splits, papéis e permissões

Cada split tem dois papéis: **admin** (pode haver vários; quem cria é admin) e **membro**. As permissões valem sempre no servidor, não só na tela.

| Ação | Quem pode | Observação |
| --- | --- | --- |
| Lançar despesa | Qualquer participante | Pode lançar despesa paga por outra pessoa (campo "Pago por"). |
| Editar ou excluir despesa | Quem lançou (`author`) ou admin | Os outros veem "Só X (quem lançou) ou um admin pode editar". Toda edição entra no histórico. |
| Marcar uma parte de despesa como paga | A própria pessoa, quem pagou a despesa ou admin | Quem pagou nunca tem parte a marcar. |
| Registrar acerto nos cartões do Meu saldo | Quem está no par (deve ou recebe) ou admin | Admin registra por qualquer pessoa com "Ver como". |
| Confirmar acerto ou "Não recebi" | Quem recebe ou admin | Acerto registrado por quem recebe já nasce confirmado. |
| Ver o Meu saldo de outra pessoa ("Ver como") | Só admin | Os outros só veem os pares com eles. |
| Desfazer acerto registrado | As duas pessoas do acerto ou admin |  |
| Anexar comprovante depois | As duas pessoas do pagamento (na parte de despesa, também admin) | Só enquanto não houver comprovante. |
| Convidar, promover, tirar admin, remover | Só admin. "Tornar admin" só aparece para quem já entrou (escolheu o nome) | Membro vê a aba Pessoas com cadeado e o texto "fale com…" (abaixo). Admin age sobre os outros; sobre si mesmo, ver "Deixar de ser admin". |
| Configurações do split (nome, capa, modo de pagamento, quem vê comprovantes) | Só admin muda; membro abre só para leitura | Tela própria (25/10/2026). Quem vê comprovantes, nas Configurações: "Todo o split" (padrão) ou "Só os envolvidos e admins" (decisão 9). Vale na hora, inclusive para comprovantes já enviados. |
| Gerar novo código de convite | Só admin | Em Pessoas, com folha de confirmação: "O link e o código atuais param de funcionar. Quem já entrou continua no split." O código antigo para na hora. |
| Liberar nome | Só admin | Desliga a pessoa do nome: o nome volta a ficar livre em "Quem é você?"; despesas, partes e histórico continuam com ele. Também tira o admin daquele participante. |
| Deixar de ser admin | O próprio admin | Fica na sua linha em Pessoas. Sendo o último admin, o papel passa para quem tem a menor ordem de entrada entre os que já escolheram o nome; sem ninguém, para a próxima pessoa que entrar. Uma folha avisa antes. |
| Sair do split | Qualquer participante | Só com saldo zero neste split. O último admin também sai: o papel passa adiante como em "Deixar de ser admin", e a folha diz para quem. Fica no menu de três pontos. |
| Finalizar e reabrir split | Só admin | No menu, "Finalizar" aparece desabilitado para membro. |
| Editar o split (nome e capa) | Só admin, com o split aberto | Nas Configurações do split. |
| Excluir o split inteiro | Só admin | No menu, "Excluir split" aparece desabilitado para membro, com "só admin". |

**O papel de admin passa adiante** (revisto em 24/10/2026). O último admin pode sair ou deixar de ser admin: o papel vai para quem tem a menor ordem de entrada entre os que já escolheram o nome, e a folha avisa ("Ao sair, Beatriz vira admin."). Se ninguém mais entrou, o split fica sem admin até a próxima pessoa entrar e escolher um nome: ela vira admin. Se o único admin perder o acesso (convidado sem link de recuperação), nada muda automaticamente na v1: o split continua para os membros, só sem convidar, promover ou finalizar.

**Sair do split** desvincula você do seu nome: o nome continua no split, com despesas e histórico, volta a ficar livre e você deixa de ver o split. Com saldo diferente de zero, a ação é bloqueada com "Quite suas contas antes de sair".

**Texto para membro na aba Pessoas**, conforme a quantidade de admins: nenhum → "fale com um admin"; 1 → o nome; 2 ou 3 → "Beatriz, Catarina ou Fellipe"; mais de 3 → "Beatriz, Catarina ou outro admin".

**Menu de três pontos do split:** Configurações do split (todos abrem; membro só lê), Convidar (admin vai para Pessoas; membro copia a mensagem com o link), Alternar tema, Sua conta, Finalizar ou Reabrir, Excluir split e Sair do split.

**Configurações do split** (25/10/2026): tela própria, aberta pelo menu ⋯ ("Configurações do split"), pelo ⋯ da home e tocando no nome ou na capa do cabeçalho. Seções: **Nome e capa** (capa ao lado do nome, como na criação, com o mesmo seletor e "Ajustar foto") · **Como registrar pagamentos** (Simplificado ou Detalhado, spec 06) · **Quem vê comprovantes**. Cada mudança vale na hora, sem Salvar geral; quem não é admin vê tudo desabilitado, com "só admin". A aba Pessoas fica só com convite e participantes. No nome e na capa: Só o que mudou vai para o servidor; vale na hora para todo mundo (home, cabeçalho, convite e a prévia do link curto) e volta, com aviso, se o servidor recusar. Split finalizado não edita até reabrir.

**Ações na home** (25/10/2026): cada cartão de "Meus splits" tem um "⋯" (e, no celular, o toque longo no cartão) que abre a folha com as ações do menu do split: Editar, Convidar (copia a mensagem com o link), Finalizar ou Reabrir, Excluir e Sair. As de admin aparecem desabilitadas para membro, com "só admin". Mesmas folhas e regras de dentro do split; Finalizar e Excluir podem ser forçados por qualquer admin, mesmo com pagamentos pendentes.

**Remover participante** é bloqueado em dois casos, com a mensagem na própria linha: quando a pessoa tem saldo diferente de zero ("Quitem as contas antes de remover") e quando ela aparece em alguma despesa ("Edite-as antes de remover").

**Excluir o split inteiro** (decidido em 24/10/2026):

- Só admin, mesmo com dinheiro pendente: a folha mostra o que ficou pendente (como em Finalizar) e avisa que não tem volta.
- Para confirmar, a pessoa digita o nome do split; só então o botão vermelho "Excluir split" libera.
- Some de vez, para todo mundo: despesas, acertos, histórico, notificações, comprovantes e capa. O convite deixa de funcionar.
- Cada pessoa que estava no split recebe no sino "Lucas excluiu o split Churras de sábado".

**Split sem ninguém é apagado sozinho** (decidido em 24/10/2026): quando a última pessoa ligada a um nome sai, começa a contagem; depois de **15 dias** sem ninguém entrar, o split é apagado como acima (sem aviso, porque não sobra ninguém). Se alguém entrar pelo convite antes, a contagem para.

**Link que não leva a lugar nenhum:** link de split ou convite de um split apagado abre a tela "Este split não existe mais", que diz o que aconteceu ("Lucas excluiu “Churras de sábado”…" ou "ficou 15 dias sem ninguém e foi apagado automaticamente"). Link errado, ou de um split em que a pessoa não está, mostra "Não encontramos este split". As duas têm "Criar um split" e "Ir para o início". Quem estava com o split aberto e perdeu o acesso (saiu, foi removido ou teve o nome liberado) volta ao início, como antes.

**Split finalizado:**

- Ninguém lança, edita nem marca pagamentos. Tudo fica só para leitura, com o aviso no topo.
- Pendências continuam visíveis. Antes de finalizar, a confirmação lista o que ficou pendente (com os pagamentos simplificados) e o botão vira "Finalizar mesmo assim".
- Admin pode reabrir quando quiser.
- Na home, splits finalizados ficam no filtro "Finalizados" e não entram no total "No total, você deve/recebe".

**Finalização automática** (decidido em 25/10/2026). "Todos quitados" = todos com saldo zero num split aberto com pelo menos uma despesa; pagamentos esperando confirmação não impedem. A contagem começa na última mudança no dinheiro (despesa lançada, editada, excluída ou restaurada; parte marcada ou desmarcada; acerto feito ou desfeito); confirmar e enviar comprovante não mexem nela.

- **24 h depois** de todos quitados, os admins veem no topo do split "Todo mundo quitou. Finalizar o split?", com Finalizar e "Agora não". Se houver pagamento esperando confirmação, a faixa diz "Tudo quitado, mas nem tudo confirmado." Ela também mostra a data em que o split finaliza sozinho.
- **"Agora não"** esconde a faixa para aquele admin, sem mexer no prazo. Ela só volta se o dinheiro mudar e todos ficarem quitados de novo (24 h depois disso).
- **7 dias depois** de todos quitados, o split finaliza sozinho (rotina de hora em hora), mesmo com confirmações pendentes, e apaga os comprovantes, como no Finalizar do admin. Cada pessoa do split recebe no sino "Churras de sábado foi finalizado: todos quitaram", e o aviso no topo diz "Finalizado automaticamente em …".
- Reabrir recomeça a contagem dos 7 dias.

**Criar split:** nome, capa (opcional), o seu nome e os outros participantes só pelo nome ("Só o nome basta"), sem nomes repetidos (ver Contas). Depois aparece a tela com link de convite, código e Compartilhar.

- **Capa** (revista em 25/10/2026): um quadrado ao lado do nome abre o mesmo seletor das despesas (abas Ícones e Emoji, com busca), mais "Enviar foto" e "Remover". Sem escolha, o app sorteia um ícone de um conjunto curado de 24 (comer e beber, festa e lazer, viagem e passeio), evitando os que a pessoa já usa nos outros splits, e ele fica salvo com o split; dá para trocar ou sortear de novo antes de criar. "Remover" põe o ícone de duas pessoas, salvo como escolha. Splits antigos sem escolha ganham um ícone fixo do conjunto, calculado do próprio split. Cada ícone ou emoji tem sempre a mesma cor de fundo; splits antigos mantêm o emoji que já tinham (25/10/2026).
- **Foto** (de capa e de perfil) passa antes por "Ajustar foto": arrastar para posicionar, zoom (pinça, roda do mouse ou controle) e a prévia ao vivo nos tamanhos em que vai aparecer. Sobe só o recorte quadrado.
- **Convite:** Copiar e Compartilhar mandam "Entre no split Churras de sábado: <link>". O link é curto (`…web.app/c/ABC-123`) e a prévia no WhatsApp ou iMessage mostra o nome e o emoji do split ("Convite para dividir as contas no Quem Paga O Quê?"), sem nomes de pessoas nem valores. Os links antigos (`…/#/convite/ABC-123`) continuam valendo.
