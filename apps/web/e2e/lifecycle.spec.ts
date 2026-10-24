import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated } from './helpers.ts';

// Ajustes finos (terceira leva): foto de perfil nos avatares, abas centralizadas e excluir o split.
const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Seções do split' }).getByRole('link', { name });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMIsLmDFTEMLQkAB9VaASlkXi8AAAAASUVORK5CYII=', 'base64');

async function setup(browser: Parameters<typeof guest>[0]) {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await openCreated(lucas);
  const bia = await joinAs(browser, code, 'Beatriz');
  return { lucas, bia, code };
}

test('foto de perfil da Beatriz aparece no avatar dela para o Lucas; abas ocupam a barra por igual', async ({ browser }) => {
  const { lucas, bia } = await setup(browser);
  await bia.goto('./#/conta');
  await bia.locator('.profile-head input[type=file]').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: PNG });
  await expect(toast(bia)).toContainText('Foto atualizada', { timeout: 15_000 });

  await tab(lucas, 'Pessoas').click();
  const row = lucas.locator('.row2', { hasText: 'Beatriz' });
  await expect(row.locator('.av.has-img img')).toBeVisible({ timeout: 15_000 });
  await expect(lucas.locator('.row2', { hasText: 'Catarina' }).locator('.av img')).toHaveCount(0);
  await shot(lucas, 'pessoas-com-foto');

  // Três abas, cada uma com um terço da barra (nada sobrando à direita).
  const bar = await lucas.locator('.tabbar').boundingBox();
  const tabs = lucas.locator('.tabbar .tab');
  await expect(tabs).toHaveCount(3);
  const last = await tabs.last().boundingBox();
  expect(Math.abs(bar!.x + bar!.width - (last!.x + last!.width))).toBeLessThan(8);
});

test('admin exclui o split digitando o nome; quem estava nele e o convite explicam o que houve', async ({ browser }) => {
  const { lucas, bia, code } = await setup(browser);
  // Para membro, a opção aparece desabilitada.
  await bia.getByRole('button', { name: 'Mais opções' }).click();
  await expect(bia.getByRole('menuitem', { name: /Excluir split/ })).toBeDisabled();

  await lucas.getByRole('button', { name: 'Mais opções' }).click();
  await lucas.getByRole('menuitem', { name: 'Excluir split' }).click();
  const sheet = lucas.getByRole('dialog', { name: 'Excluir “Churras de sábado”?' });
  await expect(sheet).toContainText('Não tem volta.');
  const confirm = sheet.getByRole('button', { name: 'Excluir split' });
  await expect(confirm).toBeDisabled();
  await sheet.getByLabel('Digite “Churras de sábado” para confirmar').fill('churras de sabado');
  await shot(lucas, 'excluir-split');
  await confirm.click();
  await expect(lucas.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
  await expect(toast(lucas)).toContainText('Split “Churras de sábado” excluído', { timeout: 15_000 });
  await expect(lucas.locator('.home-card', { hasText: 'Churras de sábado' })).toHaveCount(0);

  // A Beatriz estava no split: a tela explica, e o sino avisa.
  await expect(bia.getByRole('heading', { name: 'Este split não existe mais' })).toBeVisible({ timeout: 15_000 });
  await expect(bia.locator('main')).toContainText('Lucas excluiu “Churras de sábado”.');
  await shot(bia, 'split-excluido');
  await bia.goto('./#/notificacoes');
  await expect(bia.locator('.nrow')).toContainText('Lucas excluiu o split Churras de sábado');

  // Convite antigo: mesma explicação.
  const ze = await guest(browser);
  await ze.goto(`./#/convite/${code}`);
  await expect(ze.getByRole('heading', { name: 'Este split não existe mais' })).toBeVisible({ timeout: 15_000 });
  await ze.getByRole('button', { name: 'Ir para o início' }).click();
  await expect(ze.getByRole('heading', { name: 'Meus splits' })).toBeVisible();

  // Link que nunca existiu.
  await ze.goto('./#/s/naoexiste123');
  await expect(ze.getByRole('heading', { name: 'Não encontramos este split' })).toBeVisible({ timeout: 15_000 });
});
