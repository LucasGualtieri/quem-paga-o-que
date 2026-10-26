import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, openCreated } from './helpers.ts';

// Incentivo ao Pix (spec 03, 06 e 07): chave ao entrar, aviso no Meu saldo e "Pedir chave Pix".
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Seções do split' }).getByRole('link', { name });

/** Lucas (sem chave) cria o split e lança Pizza R$ 90,00: Beatriz e Catarina devem R$ 30,00 cada. */
async function setup(browser: Parameters<typeof guest>[0]) {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Pizza');
  await lucas.locator('#ad-amt').fill('90,00');
  await lucas.locator('.bottombar [type=submit]').click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  return { lucas, code };
}

test('chave Pix ao entrar: recomendada e opcional; chave inválida não entra', async ({ browser }) => {
  const { code } = await setup(browser);
  const bia = await guest(browser);
  await bia.goto(`./#/convite/${code}`);
  await bia.getByRole('radio', { name: /Beatriz/ }).check();
  const pix = bia.locator('.who-pix');
  await expect(pix).toContainText('Sua chave Pix');
  await expect(pix).toContainText('recomendado');
  await expect(pix).toContainText('Opcional. Quem te deve copia o Pix com o valor certo.');
  await pix.getByLabel('Sua chave Pix').fill('abc');
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(pix).toContainText('Confira a chave');
  await expect(bia).toHaveURL(/\/convite\//);
  await shot(bia, 'quem-e-voce-pix');
  await pix.getByLabel('Sua chave Pix').fill('bia@exemplo.com');
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(toast(bia)).toContainText('Você entrou', { timeout: 15_000 });
  // A chave fica no perfil (Sua conta) e vale nos splits dela.
  await bia.goto('./#/conta');
  await expect(bia.locator('.pix-current')).toContainText('bia@exemplo.com', { timeout: 15_000 });
});

test('quem deve pede a chave; quem recebe cadastra pelo aviso e quem pediu já copia o Pix', async ({ browser }) => {
  const { lucas, code } = await setup(browser);
  // Beatriz entra sem chave (o campo é opcional).
  const bia = await guest(browser);
  await bia.goto(`./#/convite/${code}`);
  await bia.getByRole('radio', { name: /Beatriz/ }).check();
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(toast(bia)).toContainText('Você entrou', { timeout: 15_000 });

  await tab(bia, 'Meu saldo').click();
  const card = bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) });
  // Beatriz só deve: nada de aviso para cadastrar a própria chave.
  await expect(bia.locator('.pix-nudge')).toHaveCount(0);
  await card.getByRole('button', { name: 'Pedir chave Pix' }).click();
  await expect(toast(bia)).toContainText('Pedimos a chave Pix para Lucas');
  await expect(card.getByRole('button', { name: 'Chave pedida' })).toBeDisabled();
  await shot(bia, 'pedir-chave');

  // Lucas tem a receber e não tem chave: vê o aviso no Meu saldo e o pedido no sino.
  await tab(lucas, 'Meu saldo').click();
  await expect(lucas.locator('.pix-nudge')).toContainText('Receba mais rápido: cadastre sua chave Pix');
  await shot(lucas, 'aviso-pix');
  const bell = lucas.getByRole('link', { name: /^Notificações/ });
  await expect(bell).toHaveAccessibleName('Notificações, 1 novas', { timeout: 15_000 });
  await bell.click();
  await lucas.locator('.nrow', { hasText: 'Beatriz quer te pagar por Pix' }).click();
  const sheet = lucas.getByRole('dialog', { name: 'Cadastrar chave Pix' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Chave Pix').fill('lucas@exemplo.com');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(toast(lucas)).toContainText('Chave Pix salva');
  await expect(lucas.locator('.pix-nudge')).toHaveCount(0);

  // Beatriz: o Copiar Pix aparece e o sino avisa que a chave chegou.
  await expect(card.getByRole('button', { name: 'Copiar Pix' })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('button', { name: 'Chave pedida' })).toHaveCount(0);
  await bia.goto('./#/notificacoes');
  await expect(bia.locator('.nrow', { hasText: 'Lucas cadastrou a chave Pix' })).toBeVisible({ timeout: 15_000 });
});

test('"Agora não" esconde o aviso só neste split', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await tab(lucas, 'Meu saldo').click();
  const nudge = lucas.locator('.pix-nudge');
  await nudge.getByRole('button', { name: 'Agora não' }).click();
  await expect(nudge).toHaveCount(0);
  await lucas.reload();
  await expect(lucas.locator('.bigbal')).toBeVisible();
  await expect(lucas.locator('.pix-nudge')).toHaveCount(0);
});
