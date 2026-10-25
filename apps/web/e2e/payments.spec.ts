import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated, setPayMode } from './helpers.ts';

// Fase 6: pagamentos entre duas (ou três) pessoas, cada uma no próprio navegador.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

// Uma foto de verdade (PNG 8×8) para o comprovante: o app reduz e regrava em JPEG antes de subir.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMIsLmDFTEMLQkAB9VaASlkXi8AAAAASUVORK5CYII=', 'base64');

/**
 * Lucas cria o split com Beatriz e Catarina, lança Pizza R$ 90,00 (R$ 30,00 cada) e Beatriz entra.
 * Pagar despesa por despesa só existe no modo detalhado; o acerto do par vale nos dois (spec 06).
 */
async function setup(browser: Parameters<typeof guest>[0], mode: 'Simplificado' | 'Detalhado' = 'Detalhado') {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Pizza');
  await lucas.locator('#ad-amt').fill('90,00');
  await lucas.locator('.bottombar [type=submit]').click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  if (mode === 'Detalhado') await setPayMode(lucas, mode);
  const bia = await joinAs(browser, code, 'Beatriz');
  return { lucas, bia, code };
}

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Seções do split' }).getByRole('link', { name });

/** Cartão da pessoa no Meu saldo, aberto. */
async function openCard(page: Page, name: string) {
  await tab(page, 'Meu saldo').click();
  const card = page.locator('.pcard', { has: page.locator('.pchead .ttl', { hasText: name }) });
  await card.locator('.pchead').click();
  return card;
}

/** Beatriz marca a parte dela da Pizza pelo cartão do Lucas. */
async function payPizzaShare(bia: Page) {
  const card = await openCard(bia, 'Lucas');
  const entry = card.locator('.pcentry', { hasText: 'Pizza' });
  await entry.getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(entry).toHaveClass(/done/);
  return { card, entry };
}

test('Beatriz marca a parte paga e envia comprovante → Lucas confere a foto e confirma', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);

  await tab(bia, 'Meu saldo').click();
  await expect(bia.locator('.bigbal')).toContainText('−R$ 30,00');
  const card = bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) });
  await expect(card.locator('.pchead')).toContainText('Você deve');
  await expect(card.locator('.pchead')).toContainText('R$ 30,00');
  await expect(bia.locator('.pcard.zero')).toContainText('Catarina');
  await shot(bia, 'meu-saldo');
  await card.locator('.pchead').click();
  const entry = card.locator('.pcentry', { hasText: 'Pizza' });
  await expect(entry).toContainText('você devia para Lucas');
  await expect(entry).toContainText('−R$ 30,00');
  await shot(bia, 'meu-saldo-aberta');
  await entry.getByRole('button', { name: 'Marcar como pago' }).click();
  // Otimista: a parte vira linha resolvida na hora e o par zera.
  await expect(entry).toHaveClass(/done/);
  await expect(entry).toContainText('você pagou para Lucas');
  await expect(entry).toContainText('esperando Lucas confirmar');
  await expect(card.locator('.pchead')).toContainText('Tudo certo');
  await expect(toast(bia)).toContainText('Pagamento registrado');

  await entry.getByRole('button', { name: 'Enviar comprovante' }).click();
  const sheet = bia.getByRole('dialog', { name: 'Enviar comprovante' });
  await expect(sheet).toContainText('Você pagou R$ 30,00 para Lucas');
  await expect(sheet).toContainText('Comprovantes ficam guardados por 15 dias.');
  await expect(sheet.getByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
  await sheet.locator('input[type=file]').setInputFiles({ name: 'pix.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet).toContainText('Foto anexada · trocar');
  await shot(bia, 'folha-comprovante');
  await sheet.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(toast(bia)).toContainText('Comprovante enviado');
  await expect(entry.getByRole('button', { name: 'Enviar comprovante' })).toHaveCount(0);

  // Lucas: a pendência vem do estado (pendConf), em qualquer caminho.
  const pizza = lucas.locator('.txrow', { hasText: 'Pizza' });
  await expect(pizza).toContainText('1 pagamento p/ conferir');
  await pizza.click();
  const share = lucas.locator('.row2', { hasText: 'Beatriz' });
  await expect(share).toContainText('Pago · confirme');
  await share.getByRole('button', { name: 'Ver comprovante' }).click();
  const proof = lucas.getByRole('dialog', { name: 'Comprovante de Beatriz' });
  await expect(proof.locator('img')).toBeVisible();
  await shot(lucas, 'ver-comprovante');
  await proof.getByRole('button', { name: 'Fechar' }).last().click();
  await share.getByRole('button', { name: 'Confirmar' }).click();
  await expect(share).toContainText('Pago · comprovante');
  await expect(toast(lucas)).toContainText('Recebimento confirmado');
  // O Histórico vem do servidor (a confirmação na tela é otimista).
  await expect(lucas.locator('.ev')).toContainText(['Beatriz marcou que pagou', 'Beatriz enviou um comprovante', 'Lucas confirmou que recebeu de Beatriz'], { timeout: 15_000 });
  await expect(share).toContainText('Pago · comprovante');
  await shot(lucas, 'detalhe-confirmado');
  // Para a Beatriz, a espera some.
  await expect(entry).not.toContainText('esperando', { timeout: 15_000 });
});

test('"Não recebi" desfaz a parte paga dos dois lados', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  const { card, entry } = await payPizzaShare(bia);

  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  const share = lucas.locator('.row2', { hasText: 'Beatriz' });
  await share.getByRole('button', { name: 'Não recebi' }).click();
  await expect(share).toContainText('Pendente');
  await expect(toast(lucas)).toContainText('Avisamos Beatriz que o pagamento não chegou');
  // Do lado da Beatriz, a parte volta a aberta e o cartão volta a "Você deve".
  await expect(entry).not.toHaveClass(/done/);
  await expect(entry.getByRole('button', { name: 'Marcar como pago' })).toBeVisible();
  await expect(card.locator('.pchead')).toContainText('Você deve');
});

test('parte paga vira linha resolvida no mesmo lugar; quem recebeu confirma ali mesmo', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  const card = await openCard(lucas, 'Beatriz');
  const entry = card.locator('.pcentry', { hasText: 'Pizza' });
  await expect(entry).toContainText('Beatriz te devia');
  await expect(entry.getByRole('button', { name: 'Recebi' })).toBeVisible();

  await payPizzaShare(bia);
  await expect(entry).toHaveClass(/done/);
  await expect(entry).toContainText('Beatriz te pagou');
  await expect(entry).toContainText('Beatriz marcou como pago');
  await expect(card.locator('.pchead')).toContainText('1 para conferir');
  await shot(lucas, 'meu-saldo-parte-resolvida');
  await entry.getByRole('button', { name: 'Confirmar' }).click();
  await expect(toast(lucas)).toContainText('Recebimento confirmado');
  await expect(entry).not.toContainText('marcou como pago');
  await expect(card.locator('.pchead')).not.toContainText('para conferir');

  // Desfazer na linha resolvida volta a parte para aberta.
  await entry.getByRole('button', { name: 'Desfazer' }).click();
  await expect(entry).not.toHaveClass(/done/);
  await expect(card.locator('.pchead')).toContainText('Te deve');
});

test('acerto do par: Beatriz paga o saldo com o Lucas; ele confirma; Desfazer volta', async ({ browser }) => {
  const { lucas, bia } = await setup(browser, 'Simplificado');
  await tab(bia, 'Meu saldo').click();
  const card = bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) });
  // Lucas não tem chave Pix: sem "Copiar Pix".
  await expect(card.getByRole('button', { name: 'Copiar Pix' })).toHaveCount(0);
  await card.locator('.pcmain').getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(toast(bia)).toContainText('Pagamento registrado · avisamos Lucas');
  await expect(card.locator('.pchead')).toContainText('Tudo certo');
  await expect(bia.locator('.bigbal')).toContainText('você está quitado');
  await card.locator('.pchead').click();
  const settle = card.locator('.pcentry.done', { hasText: 'Acerto de contas' });
  await expect(settle).toContainText('esperando Lucas confirmar');
  await expect(card.locator('.pcentry', { hasText: 'Pizza' })).toContainText('compensado no saldo');
  await card.locator('.pcentry', { hasText: 'Pizza' }).getByRole('button', { name: 'O que é compensado no saldo?' }).click();
  await expect(bia.locator('.infotip-bubble')).toContainText('Essa parte não foi paga');
  await shot(bia, 'meu-saldo-acerto');

  await tab(lucas, 'Meu saldo').click();
  const bcard = lucas.locator('.pcard', { has: lucas.locator('.pchead .ttl', { hasText: 'Beatriz' }) });
  const pend = bcard.locator('.pcpend');
  await expect(pend).toContainText('Beatriz registrou um pagamento de R$ 30,00');
  await expect(bcard.locator('.pchead')).toContainText('1 para conferir');
  // Catarina ainda deve.
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 30,00');
  await shot(lucas, 'meu-saldo-conferir');
  await pend.getByRole('button', { name: 'Confirmar' }).click();
  await expect(toast(lucas)).toContainText('Recebimento confirmado');
  await expect(bcard.locator('.pcpend')).toHaveCount(0);
  await expect(settle).not.toContainText('esperando', { timeout: 15_000 });

  await bcard.locator('.pchead').click();
  await bcard.locator('.pcentry.done', { hasText: 'Acerto de contas' }).getByRole('button', { name: 'Desfazer' }).click();
  await expect(bcard.locator('.pchead')).toContainText('Te deve');
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 60,00');
});

test('"Não recebi" no acerto: some dos dois lados e avisa quem pagou', async ({ browser }) => {
  const { lucas, bia } = await setup(browser, 'Simplificado');
  await tab(bia, 'Meu saldo').click();
  const card = bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) });
  await card.locator('.pcmain').getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(card.locator('.pchead')).toContainText('Tudo certo');

  await tab(lucas, 'Meu saldo').click();
  const pend = lucas.locator('.pcpend');
  await pend.getByRole('button', { name: 'Não recebi' }).click();
  await expect(toast(lucas)).toContainText('Avisamos Beatriz que o pagamento não chegou');
  await expect(pend).toHaveCount(0);
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 60,00');
  await expect(card.locator('.pchead')).toContainText('Você deve', { timeout: 15_000 });
});

test('admin vê como outra pessoa e registra o acerto por ela', async ({ browser }) => {
  const { lucas, bia } = await setup(browser, 'Simplificado');
  await tab(lucas, 'Meu saldo').click();
  await lucas.getByRole('button', { name: 'O que é Ver como?' }).click();
  await expect(lucas.locator('.infotip-bubble')).toContainText('Mostra o Meu saldo como essa pessoa vê');
  await lucas.getByLabel('Ver como', { exact: true }).selectOption({ label: 'Beatriz' });
  await expect(lucas.locator('.viewbanner')).toContainText('Vendo como Beatriz');
  await expect(lucas.locator('.card', { hasText: 'Saldo de Beatriz neste split' })).toContainText('−R$ 30,00');
  const card = lucas.locator('.pcard', { has: lucas.locator('.pchead .ttl', { hasText: 'Você' }) });
  await expect(card.locator('.pchead')).toContainText('Beatriz deve');
  await shot(lucas, 'ver-como');
  await card.locator('.pcmain').getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(card.locator('.pchead')).toContainText('Tudo certo');
  await lucas.getByRole('button', { name: 'Voltar para você' }).click();
  await expect(lucas.locator('.viewbanner')).toHaveCount(0);
  await expect(lucas.locator('.pcard', { has: lucas.locator('.pchead .ttl', { hasText: 'Beatriz' }) }).locator('.pchead')).toContainText('Tudo certo');
  // Registrado por quem recebe: já vale, sem "para conferir"; Beatriz vê o par quitado.
  await expect(lucas.locator('.pcpend')).toHaveCount(0);
  await tab(bia, 'Meu saldo').click();
  await expect(bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) }).locator('.pchead')).toContainText('Tudo certo');
  // Quem não é admin não tem o seletor.
  await expect(bia.getByLabel('Ver como', { exact: true })).toHaveCount(0);
});

test('"Só os envolvidos e admins": Catarina não abre o comprovante da Beatriz', async ({ browser }) => {
  const { lucas, bia, code } = await setup(browser);
  const { entry } = await payPizzaShare(bia);
  await entry.getByRole('button', { name: 'Enviar comprovante' }).click();
  const sheet = bia.getByRole('dialog', { name: 'Enviar comprovante' });
  await sheet.locator('input[type=file]').setInputFiles({ name: 'pix.png', mimeType: 'image/png', buffer: PNG });
  await sheet.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(toast(bia)).toContainText('Comprovante enviado');

  // "Quem vê comprovantes" fica nas Configurações do split.
  await lucas.getByRole('button', { name: 'Mais opções' }).click();
  await lucas.getByRole('menuitem', { name: 'Configurações do split' }).click();
  await lucas.getByRole('radio', { name: /Só os envolvidos e admins/ }).check();
  await expect(lucas.getByRole('radio', { name: /Só os envolvidos e admins/ })).toBeChecked();
  await expect(toast(lucas)).toContainText('Pronto: Só os envolvidos e admins', { timeout: 15_000 });
  await shot(lucas, 'config-comprovantes');

  const cat = await joinAs(browser, code, 'Catarina');
  await cat.locator('.txrow', { hasText: 'Pizza' }).click();
  const share = cat.locator('.row2', { hasText: 'Beatriz' });
  await expect(share).toContainText('Pago · comprovante');
  await expect(share.getByRole('button', { name: 'Ver comprovante' })).toHaveCount(0);
  // O admin continua vendo.
  await lucas.goto(lucas.url().replace(/\/config$/, ''));
  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  await expect(lucas.locator('.row2', { hasText: 'Beatriz' }).getByRole('button', { name: 'Ver comprovante' })).toBeVisible();
});

test('modo simplificado: despesas só com a parte de cada um; paga-se o saldo do par no Meu saldo', async ({ browser }) => {
  const { lucas, bia } = await setup(browser, 'Simplificado');
  const row = bia.locator('.txrow', { hasText: 'Pizza' });
  await expect(row).toContainText('sua parte R$ 30,00');
  await expect(row.locator('.mine')).toHaveClass(/muted/);
  await row.click();
  // Detalhe: só os valores, sem botões de pagamento.
  await expect(bia.locator('.row2', { hasText: 'Você' })).toContainText('R$ 30,00');
  await expect(bia.getByRole('button', { name: 'Marcar como pago' })).toHaveCount(0);
  await expect(bia.locator('.row2', { hasText: 'Você' })).not.toContainText('Pendente');
  await shot(bia, 'simplificado-detalhe');
  await bia.getByRole('link', { name: 'Voltar' }).click();

  const card = await openCard(bia, 'Lucas');
  // Dentro do cartão, as despesas são só leitura; o acerto fica no topo.
  await expect(card.locator('.pcentry', { hasText: 'Pizza' }).getByRole('button')).toHaveCount(0);
  await card.locator('.pcmain').getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(card.locator('.pchead')).toContainText('Tudo certo');
  await shot(bia, 'simplificado-meu-saldo');

  // Excluir a despesa continua permitido, com aviso para quem já acertou.
  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  await lucas.getByRole('button', { name: 'Excluir', exact: true }).first().click();
  const del = lucas.getByRole('dialog', { name: 'Excluir “Pizza”?' });
  await expect(del).toContainText('Isso muda o saldo de quem já acertou.', { timeout: 15_000 });
  await shot(lucas, 'simplificado-excluir');
});

test('modo detalhado: o acerto marca as despesas do par; Desfazer numa delas desfaz o acerto inteiro', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  // Beatriz também pagou uma despesa: Uber R$ 20,00 entre ela e o Lucas (Lucas deve R$ 10,00).
  await bia.getByRole('link', { name: 'Adicionar despesa' }).click();
  await bia.locator('#ad-desc').fill('Uber');
  await bia.locator('#ad-amt').fill('20,00');
  await bia.getByRole('group', { name: 'Dividir com' }).getByRole('button', { name: /Catarina/ }).click();
  await bia.locator('.bottombar [type=submit]').click();
  await expect(toast(bia)).toContainText('Despesa adicionada');

  const card = await openCard(bia, 'Lucas');
  await expect(card.locator('.pchead')).toContainText('R$ 20,00');
  await card.locator('.pcmain').getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(card.locator('.pchead')).toContainText('Tudo certo');
  const pizza = card.locator('.pcentry', { hasText: 'Pizza' });
  await expect(pizza).toHaveClass(/done/);
  await expect(pizza).toContainText('Paga no acerto');
  await expect(card.locator('.pcentry', { hasText: 'Uber' })).toContainText('Compensada no acerto');
  await shot(bia, 'detalhado-acerto');

  // Lucas vê as partes marcadas no detalhe da despesa.
  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  await expect(lucas.locator('.row2', { hasText: 'Beatriz' })).toContainText('Paga no acerto', { timeout: 15_000 });
  await lucas.getByRole('link', { name: 'Voltar' }).click();

  // Desfazer numa parte paga no acerto: a folha diz o que o acerto cobre.
  await pizza.getByRole('button', { name: 'Desfazer' }).click();
  const sheet = bia.getByRole('dialog', { name: 'Desfazer o acerto?' });
  await expect(sheet).toContainText('marcou como pagas 2 despesas');
  await expect(sheet.locator('.covered li')).toHaveText(['Pizza', 'Uber']);
  await shot(bia, 'detalhado-desfazer');
  await sheet.getByRole('button', { name: 'Desfazer acerto' }).click();
  await expect(card.locator('.pchead')).toContainText('Você deve');
  await expect(pizza).not.toHaveClass(/done/);
  await expect(lucas.locator('.txrow', { hasText: 'Pizza' })).toContainText('a receber +R$ 60,00', { timeout: 15_000 });
});
