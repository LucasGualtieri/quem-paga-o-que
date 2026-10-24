import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated } from './helpers.ts';

// Fase 7: notificações no app, entre duas pessoas em navegadores diferentes.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Seções do split' }).getByRole('link', { name });

/** Lucas cria o split, lança Pizza R$ 90,00 (R$ 30,00 cada); Beatriz entra e marca a parte dela como paga. */
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
  await tab(bia, 'Minha visão').click();
  const card = bia.locator('.pcard', { has: bia.locator('.pchead .ttl', { hasText: 'Lucas' }) });
  await card.locator('.pchead').click();
  await card.locator('.pcentry', { hasText: 'Pizza' }).getByRole('button', { name: 'Marcar como pago' }).click();
  await expect(toast(bia)).toContainText('Pagamento registrado · avisamos Lucas');
  return { lucas, bia };
}

test('chegar pela notificação mostra o banner; voltar pela lista não mostra', async ({ browser }) => {
  const { lucas } = await setup(browser);

  const bell = lucas.getByRole('link', { name: /^Notificações/ });
  await expect(bell).toHaveAccessibleName('Notificações, 1 novas', { timeout: 15_000 });
  await expect(bell.locator('.bdg')).toHaveText('1');
  await bell.click();
  const item = lucas.locator('.nrow', { hasText: 'Beatriz pagou R$ 30,00 pra você' });
  await expect(item).toContainText('Pizza · Churras de sábado · sem comprovante');
  await expect(item).toHaveClass(/unread/);
  await shot(lucas, 'notificacoes');
  await item.click();

  // Pelo aviso: banner, linha destacada e Confirmar só no banner (sem ação repetida).
  const banner = lucas.locator('.nbanner');
  await expect(banner).toContainText('Beatriz marcou que pagou R$ 30,00');
  await expect(lucas.locator('.row2.hlrow')).toContainText('Beatriz');
  await expect(lucas.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
  await shot(lucas, 'detalhe-pela-notificacao');
  await banner.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(banner).toContainText('Você confirmou o recebimento');
  await expect(lucas.locator('.row2', { hasText: 'Beatriz' })).toContainText('Pago');

  // Pela lista de transações: sem banner.
  await lucas.getByRole('link', { name: 'Voltar' }).click();
  await lucas.locator('.txrow', { hasText: 'Pizza' }).click();
  await expect(lucas.getByRole('heading', { name: 'Pizza' })).toBeVisible();
  await expect(lucas.locator('.nbanner')).toHaveCount(0);

  // Já lida: o sino fica sem contagem e a lista mostra o estado.
  await lucas.goto('./#/notificacoes');
  await expect(lucas.locator('.nrow')).toContainText('· confirmado');
  await expect(lucas.locator('.nrow.unread')).toHaveCount(0);
});

test('"Não recebi" pelo banner avisa quem marcou; "Marcar todas como lidas"', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  await lucas.getByRole('link', { name: /^Notificações/ }).click();
  await lucas.locator('.nrow').first().click();
  await lucas.locator('.nbanner').getByRole('button', { name: 'Não recebi' }).click();
  await expect(toast(lucas)).toContainText('Avisamos Beatriz que o pagamento não chegou');
  await expect(lucas.locator('.nbanner')).toContainText('Você avisou que não recebeu');

  await expect(bia.getByRole('link', { name: 'Notificações, 1 novas' })).toBeVisible({ timeout: 15_000 });
  await bia.getByRole('link', { name: /^Notificações/ }).click();
  await expect(bia.locator('.nrow')).toContainText('Lucas avisou que não recebeu R$ 30,00');
  await bia.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(bia.locator('.nrow.unread')).toHaveCount(0);
  await expect(bia.getByRole('button', { name: 'Marcar todas como lidas' })).toHaveCount(0);
});

test('"No app" desligado em Sua conta: o sino some', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await expect(lucas.getByRole('link', { name: /^Notificações/ })).toBeVisible();
  await lucas.goto('./#/conta');
  await lucas.getByRole('switch', { name: /No app/ }).click();
  await expect(lucas.getByRole('switch', { name: /Por e-mail/ })).toHaveCount(0);
  await lucas.goto('./#/');
  await expect(lucas.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
  await expect(lucas.getByRole('link', { name: /^Notificações/ })).toHaveCount(0);
});
