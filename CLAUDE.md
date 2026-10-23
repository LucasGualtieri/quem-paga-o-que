# Quem Paga O Quê?

Web app de divisão de despesas em grupo. Front estático no GitHub Pages, back-end no Firebase.

## Onde está cada coisa
- Regras do produto: docs/spec/ (fonte da verdade das regras)
- Visual: reference/ (fonte da verdade visual; o código do protótipo é
  referência de layout e comportamento, não de arquitetura)
- Plano e fases: docs/plan.md
- Decisões pendentes: docs/spec/pontos-em-aberto.md

## Comandos
<!-- preencher na Fase 1, quando os scripts existirem -->
- dev:
- testes:
- emuladores:

## Regras inegociáveis
- Valores sempre em centavos inteiros; só a tela formata em R$.
- Saldo nunca é guardado: é calculado das despesas e pagamentos,
  sempre pelo módulo de cálculo compartilhado.
- Toda permissão vale no servidor (Security Rules ou Cloud Functions),
  nunca só na tela. Mudou uma regra? Atualize os testes de regras.
- UX otimista em toda ação (toggle, marcar pago, acerto, admin, finalizar…):
  aplica na hora e assume sucesso; só volta ao estado anterior, com toast
  de erro, se o servidor recusar. O servidor continua sendo a autoridade.
- Firebase em us-east1 (Functions e Storage).
- Nada da seção "Andaime do protótipo" entra no produto.
- Cores só por tokens (variáveis CSS), nunca hex no componente. Toda cor
  vive só em apps/web/src/theme/tokens.css: a paleta ainda vai mudar.
- Todo texto passa pelo i18n: PT-BR padrão, EN completo.
- Vocabulário da spec: split, despesa, parte, acerto.
- IMPORTANT: se a tarefa esbarrar num ponto em aberto, pare e pergunte.
  Não invente regra.

## Fluxo
- Trabalhe contra os emuladores, nunca contra o projeto de produção.
- Termine cada tarefa com typecheck e testes passando e mostre a saída.
- Mudou a UI? Screenshot em 390 px e 1440 px comparado com reference/.
