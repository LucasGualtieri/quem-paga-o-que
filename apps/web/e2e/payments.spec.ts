import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated } from './helpers.ts';

// Fase 6: pagamentos entre duas (ou três) pessoas, cada uma no próprio navegador.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

// Uma foto de verdade (PNG 8×8) para o comprovante: o app reduz e regrava em JPEG antes de subir.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMIsLmDFTEMLQkAB9VaASlkXi8AAAAASUVORK5CYII=', 'base64');

/** Lucas cria o split com Beatriz e Catarina, lança Pizza R$ 90,00 (R$ 30,00 cada) e Beatriz entra. */
async function setup(browser: Parameters<typeof guest>[0]) {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Pizza');
  await lucas.locator('#ad-amt').fill('90');
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  const bia = await joinAs(browser, code, 'Beatriz');
  return { lucas, bia, code };
}

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Seções do split' }).getByRole('link', { name });

test('Beatriz marca pago e envia comprovante → Lucas confere a foto e confirma', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);

  await tab(bia, 'Minha visão').click();
  const row = bia.locator('.row2', { hasText: 'Pizza' });
  await expect(row).toContainText('Pendente');
  await expect(row).toContainText('−R$ 30,00');
  await shot(bia, 'minha-visao-pendente');
  await row.getByRole('button', { name: 'Marcar como pago' }).click();
  // Otimista: a linha fica no lugar e troca o selo na hora.
  await expect(row).toContainText('Pago');
  await expect(toast(bia)).toContainText('Pagamento registrado');

  await row.getByRole('button', { name: 'Enviar comprovante' }).click();
  const sheet = bia.getByRole('dialog', { name: 'Enviar comprovante' });
  await expect(sheet).toContainText('Você pagou R$ 30,00 para Lucas');
  await expect(sheet).toContainText('Comprovantes ficam guardados por 15 dias.');
  await expect(sheet.getByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
  await sheet.locator('input[type=file]').setInputFiles({ name: 'pix.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet).toContainText('Foto anexada · trocar');
  await shot(bia, 'folha-comprovante');
  await sheet.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(toast(bia)).toContainText('Comprovante enviado');
  await expect(row.getByRole('button', { name: 'Enviar comprovante' })).toHaveCount(0);

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
});

test('"Não recebi" desfaz a parte paga dos dois lados', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  await tab(bia, 'Minha visão').click();
  const row = bia.locator('.row2', { hasText: 'Pizza' });
  await row.getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(row).toContainText('Pago');

  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  const share = lucas.locator('.row2', { hasText: 'Beatriz' });
  await share.getByRole('button', { name: 'Não recebi' }).click();
  await expect(share).toContainText('Pendente');
  await expect(toast(lucas)).toContainText('Avisamos Beatriz que o pagamento não chegou');
  // Do lado da Beatriz, a linha volta a pendente.
  await expect(row).toContainText('Pendente');
  await expect(row.getByRole('button', { name: 'Marcar como pago' })).toBeVisible();
});

test('acerto pelo Saldo: Recebi vira linha resolvida nos dois cartões; Desfazer volta', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  await tab(lucas, 'Saldo').click();
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 60,00');
  const mine = lucas.locator('.pcard.me');
  await expect(mine).toContainText('Beatriz te deve');
  await shot(lucas, 'saldo');
  await mine.locator('.pcline', { hasText: 'Beatriz te deve' }).locator('xpath=..').getByRole('button', { name: 'Recebi' }).click();
  await expect(toast(lucas)).toContainText('Pagamento registrado');
  await expect(mine.locator('.pcline.done')).toContainText('Beatriz te pagou');
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 30,00');

  // Beatriz vê o acerto no cartão dela e, em Minha visão, como "Acerto de contas".
  await tab(bia, 'Saldo').click();
  const biaCard = bia.locator('.pcard.me');
  await expect(biaCard.locator('.pcline.done')).toContainText('Você pagou Lucas');
  await expect(bia.locator('.bigbal')).toContainText('você está quitado');
  await tab(bia, 'Minha visão').click();
  await expect(bia.locator('.row2', { hasText: 'Acerto de contas' })).toContainText('Pago');
  await expect(bia.locator('.row2', { hasText: 'Pizza' })).toContainText('Quitado no acerto');
  await shot(bia, 'minha-visao-acerto');

  await mine.locator('.pcline.done').getByRole('button', { name: 'Desfazer' }).click();
  await expect(mine.locator('.pcline.done')).toHaveCount(0);
  await expect(lucas.locator('.bigbal')).toContainText('+R$ 60,00');
});

test('"Só os envolvidos e admins": Catarina não abre o comprovante da Beatriz', async ({ browser }) => {
  const { lucas, bia, code } = await setup(browser);
  await tab(bia, 'Minha visão').click();
  const row = bia.locator('.row2', { hasText: 'Pizza' });
  await row.getByRole('button', { name: 'Marcar como pago' }).click();
  await row.getByRole('button', { name: 'Enviar comprovante' }).click();
  const sheet = bia.getByRole('dialog', { name: 'Enviar comprovante' });
  await sheet.locator('input[type=file]').setInputFiles({ name: 'pix.png', mimeType: 'image/png', buffer: PNG });
  await sheet.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(toast(bia)).toContainText('Comprovante enviado');

  await tab(lucas, 'Pessoas').click();
  await lucas.getByRole('radio', { name: /Só os envolvidos e admins/ }).check();
  await expect(lucas.getByRole('radio', { name: /Só os envolvidos e admins/ })).toBeChecked();
  await shot(lucas, 'pessoas-comprovantes');

  const cat = await joinAs(browser, code, 'Catarina');
  await cat.locator('.txrow', { hasText: 'Pizza' }).click();
  const share = cat.locator('.row2', { hasText: 'Beatriz' });
  await expect(share).toContainText('Pago · comprovante');
  await expect(share.getByRole('button', { name: 'Ver comprovante' })).toHaveCount(0);
  // O admin continua vendo.
  await lucas.goto(lucas.url().replace(/\/pessoas$/, ''));
  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  await expect(lucas.locator('.row2', { hasText: 'Beatriz' }).getByRole('button', { name: 'Ver comprovante' })).toBeVisible();
});

test('parte paga em Minha visão vira linha resolvida no Saldo, no mesmo lugar', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  await tab(lucas, 'Saldo').click();
  const mine = lucas.locator('.pcard.me');
  const lines = mine.locator('.pcline');
  await expect(lines.nth(0)).toContainText('Beatriz te deve');
  await expect(lines.nth(1)).toContainText('Catarina te deve');

  await tab(bia, 'Minha visão').click();
  await bia.locator('.row2', { hasText: 'Pizza' }).getByRole('button', { name: 'Marcar como pago' }).click();

  // Para o Lucas, a linha da Beatriz troca de estado sem sair do lugar.
  await expect(lines.nth(0)).toHaveClass(/done/);
  await expect(lines.nth(0)).toContainText('Beatriz te pagou');
  await expect(lines.nth(0)).toContainText('Pizza');
  await expect(lines.nth(1)).toContainText('Catarina te deve');
  await shot(lucas, 'saldo-parte-resolvida');

  // Para a Beatriz, no cartão dela, com Desfazer.
  await tab(bia, 'Saldo').click();
  const done = bia.locator('.pcard.me .pcline.done');
  await expect(done).toContainText('Você pagou Lucas');
  await done.getByRole('button', { name: 'Desfazer' }).click();
  await expect(bia.locator('.pcard.me .pcline.done')).toHaveCount(0);
  await expect(bia.locator('.pcard.me')).toContainText('Você deve para Lucas');
});
