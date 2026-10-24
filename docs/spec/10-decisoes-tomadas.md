# Decisões tomadas e o porquê

O que foi decidido e descartado durante o design. Ideias descartadas não devem voltar sem nova decisão.

| Decisão | Motivo |
| --- | --- |
| Saldo em **cartões por pessoa** com dívidas reais de cada par; sem "Quem paga quem" simplificado | A simplificação cria pagamentos entre pessoas que não têm nada a ver uma com a outra (ex.: Fellipe pagar Beatriz por algo que Catarina comprou). Entre amigos isso gera desconfiança ("por que eu pago para ela?") e desliga o pagamento da despesa de origem. O par real é o que cada um consegue conferir. A simplificação só sobrevive no resumo de Finalizar, como informação. |
| **Sem matriz**, nem no celular nem no desktop | Difícil de ler em tela pequena e redundante com os cartões; a aba Matriz foi renomeada para Saldo e a antiga aba Saldos saiu. |
| Destaque vem do caminho; pendência vem do estado | Ver Notificações: o banner persistia e não sumia depois de resolvido. |
| Push só no app nativo | Web push no celular não é confiável; a opção some no navegador em vez de prometer algo que pode não chegar. |
| Pagamento otimista (vale na hora) + confirmar / "Não recebi" | Entre amigos, a maioria dos pagamentos é real; esperar confirmação travaria os saldos. "Deixe como está": sem estado "a confirmar" e sem confirmação automática. |
| Comprovante opcional, pergunta **desligada por padrão** | Pedir comprovante em todo pagamento atrasa quem só quer marcar. Quem quer, liga em Sua conta ou envia depois. |
| Divisão **inline**, sem tela cheia de "Ajustar divisão" | Menos navegação; o efeito de cada mudança aparece ao lado do valor. |
| Seleção de pessoas **sem checkbox** (anel + selo) | O checkbox ficava feio e pesado em listas longas. Chips para pessoas também foram descartados. |
| Pagos ficam **no lugar** em "O que eu devo" | Uma seção "Já paguei" vazia no começo parecia erro; manter a linha no lugar segue o mesmo padrão de "a receber". |
| "Eu" = avatar normal + nome em negrito | A bolinha parecia notificação; anel extra, anel escuro e avatar quadrado foram testados e rejeitados. |
| Resolvidos ficam no cartão de quem pagou e de quem recebeu | Cada pessoa vê o próprio histórico no próprio cartão. |
| Qualquer envolvido ou admin marca a linha em qualquer cartão | Antes não dava para marcar o pagamento da Catarina no cartão dela. |
| Toast em pílula clara com check; saldo com fade de 4 px | A barra preta assustava e a animação anterior chamava atenção demais. |
| Login com ilustração neutra | O selo verde de "pago" na ilustração era enganoso. |
| Filtros em dois menus (Pessoas, Tags) | Uma fileira de chips misturando pessoas e tags não escalava. |
| Login opcional; convidado pode criar split | Barreira de cadastro afasta quem só quer ver a própria parte; o link de recuperação cobre a troca de aparelho. |
| "+" flutuante (roxo, `--accent`) abre nova despesa; o "+" amarelo da ilustração do estado vazio da home vira "Novo split" | Cada botão faz a ação mais provável daquela tela. |
| **Desktop igual ao celular** (coluna única centralizada), sem barra lateral nem Transações + Saldo lado a lado — decidido em 24/10/2026 | Uma UI só: menos informação na tela, uma interface para a pessoa aprender e um código só para manter. O layout de duas colunas de `Desktop.dc.html` foi implementado e descartado. |
