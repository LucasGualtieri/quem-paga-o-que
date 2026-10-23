# Quem Paga O Quê?

Web app de divisão de despesas em grupo. Front estático no GitHub Pages, back-end no Firebase.

## Onde está cada coisa
- Regras do produto: docs/spec/ (fonte da verdade das regras)
- Visual: reference/ (fonte da verdade visual; o código do protótipo é
  referência de layout e comportamento, não de arquitetura)
- Plano e fases: docs/plan.md
- Decisões pendentes: docs/spec/pontos-em-aberto.md

## Comandos
- instalar: npm install
- typecheck: npm run typecheck
- testes: npm test (Vitest com cobertura; packages/calc exige 100%)
- dev: npm run dev (http://localhost:5173; telas de revisão em /#/dev)
- regras e Functions: npm run test:emulators (sobe os emuladores sozinho)
- e2e: npm run e2e (sobe os emuladores; Playwright em 390 e 1440 px;
  screenshots em apps/web/test-results)
- emuladores: npm run emulators (precisa de Java 21+; app em dev usa eles)
- protótipo: node scripts/serve-reference.mjs (http://localhost:8000)
- deploy no staging: npm run deploy:staging (regras + Functions em
  qpq-staging); o Pages publica o app sozinho a cada push na main.
  Nunca publique em produção.
- Hook (.claude/settings.json) já roda typecheck e testes depois de cada
  edição de código; se ele acusar falha, corrija antes de seguir.

## Código
- packages/calc: motor de partes e saldos, TypeScript puro, sem I/O.
  Toda conta de dinheiro passa por ele (app e Cloud Functions).
- packages/shared: nomes (nameKey), convite e o contrato das Functions.
- functions: Cloud Functions chamáveis; participantes e papéis só mudam
  por elas (as regras negam escrita direta em splits).
- apps/web: SPA (React + Vite + HashRouter). Componentes da Folha de
  estilo em src/components; valores em R$ só por lib/money.ts;
  ações otimistas só por lib/optimistic.ts (useOptimisticValue /
  useOptimisticAction).

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
