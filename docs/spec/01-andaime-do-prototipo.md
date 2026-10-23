# Andaime do protótipo: não implementar

Tudo abaixo existe só para o protótipo funcionar sem back-end. No produto, cada item vem do servidor ou de uma ação real do usuário.

| No protótipo | O que é de verdade no produto |
| --- | --- |
| `seed()`: splits Ano Novo Amigubis, Amigo Oculto 2026 e Viagem Ouro Preto, com as despesas, datas e horários | Dados de exemplo. O app começa vazio (estado "Nenhum split por aqui"). |
| Pessoas fixas Lucas, Beatriz, Catarina, Fellipe, mais Marina, Rafael e Luca (só para testar mais de 5 pessoas e nomes parecidos) | Participantes vêm do split. Lucas é o "eu" apenas no protótipo. |
| As duas notificações prontas (Beatriz com comprovante, "nova"; Catarina sem comprovante, "confirmada") | Simulações. Notificações nascem quando alguém marca que pagou (seção Notificações). |
| No Amigo Oculto: `paid`, `proof` e `pendConf` já preenchidos na despesa "Comidinhas da troca" | Estado que, no produto, resulta das ações de Beatriz e Catarina. |
| `meMember: true` no Amigo Oculto | Atalho para mostrar a visão de membro. No produto, o papel vem de `admins` do split. |
| Tweaks `preset`, `theme`, `lang`, `role`, `platform`, `homeState` | Controles de revisão. `theme` e `lang` viram preferências do usuário; `role` vem do split; `platform` vem do ambiente (app nativo × navegador); o resto não existe. |
| Presets (`split-saldos`, `add-items-big`, `detail-notif`, `pay-sheet-proof` etc.) e as galerias Telas 1–5 | Atalhos para abrir uma tela em um estado. Não há rota nem tela correspondente a eles. |
| Tempos de carregamento fixos (600–900 ms) e skeletons forçados | Mostrar o skeleton enquanto a requisição real não volta. |
| Datas fixas: "agora", finalização em 31/12/2026, e-mail `lucas@exemplo.com`, códigos `AMG-7K2`, `AMG-OC6`, `K7M-24Q` | Valores gerados pelo servidor. |
| Login, Google, troca de senha e envio do link de recuperação só trocam de tela | Precisam de autenticação real (ver Contas). |
| Fotos de capa e comprovante são placeholders; o upload não sai do aparelho | Upload real com armazenamento. |
| Chave de estado por preset (`S()`/`set()`), `forceUpdate`, `_fl` para reiniciar a animação | Detalhe de implementação do canvas. Use o gerenciamento de estado do framework escolhido. |
| Desfazer guarda uma cópia inteira dos splits | No produto, desfazer é uma ação inversa no servidor dentro da janela do toast (cerca de 4 s). |

**Regra de bolso:** se algo só aparece por causa de um preset ou de `seed()`, é andaime. Se aparece por causa de um clique, é regra de produto e está descrito nas próximas seções.
