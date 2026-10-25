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
  // Antes de subir, "Ajustar foto" com a prévia nos tamanhos em que aparece.
  const crop = bia.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(crop.locator('.crop-pv .av img')).toHaveCount(4);
  await crop.getByRole('button', { name: 'Usar foto' }).click();
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

test('capa do split: ícone de pessoas por padrão, emoji pelo seletor ou foto recortada', async ({ browser }) => {
  const lucas = await guest(browser);
  await lucas.getByRole('link', { name: 'Novo split' }).click();
  const pick = lucas.getByRole('button', { name: 'Escolher a capa do split (opcional)' });
  await expect(pick.locator('.cover svg')).toBeVisible();
  await pick.click();
  const picker = lucas.getByRole('dialog', { name: 'Capa do split' });
  await picker.getByRole('button', { name: 'Emoji' }).click();
  await picker.getByLabel('Buscar').fill('pizza');
  await picker.getByRole('option').first().click();
  await expect(pick.locator('.cover')).toHaveText('🍕');

  // Foto: passa pelo recorte e vira a capa.
  await pick.click();
  await picker.locator('input[type=file]').setInputFiles({ name: 'grupo.png', mimeType: 'image/png', buffer: PNG });
  const crop = lucas.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(crop.locator('.crop-pv .cover img')).toHaveCount(3);
  await shot(lucas, 'ajustar-foto-capa');
  await crop.getByRole('button', { name: 'Usar foto' }).click();
  await expect(pick.locator('.cover img')).toBeVisible();

  await lucas.getByLabel('Nome do split *').fill('Pizzaria');
  await lucas.getByLabel('Seu nome').fill('Lucas');
  await lucas.getByRole('button', { name: 'Criar split' }).click();
  await expect(lucas.getByRole('heading', { name: '“Pizzaria” está pronto!' })).toBeVisible();
  await expect(lucas.locator('.created .cover img')).toBeVisible();
});

test('item minimizado mostra o ícone; Meu saldo mostra o negativo com "−"', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await lucas.locator('#ad-desc').fill('Mercado');
  await lucas.locator('#ad-amt').fill('100,00');
  await lucas.getByRole('radio', { name: 'Beatriz' }).click();
  await lucas.getByRole('button', { name: /Dividir por itens/ }).click();
  await lucas.getByLabel('Nome do item').fill('Cerveja');
  await lucas.getByLabel('Valor do item').fill('30,00');
  await lucas.getByRole('button', { name: 'Adicionar item' }).click();
  // O item anterior minimizou e continua mostrando o ícone.
  await expect(lucas.locator('.itemcard .imin').first().locator('.tagico')).toBeVisible();
  await lucas.getByRole('button', { name: 'Remover Item 2' }).click();
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');

  await tab(lucas, 'Meu saldo').click();
  await expect(lucas).toHaveURL(/\/saldo$/);
  const card = lucas.locator('.pcard', { has: lucas.locator('.pchead .ttl', { hasText: 'Beatriz' }) });
  await expect(card.locator('.pchead .amt')).toHaveText(/^−R\$/);
  // Link antigo da Minha visão leva para cá.
  await lucas.goto(lucas.url().replace(/\/saldo$/, '/eu'));
  await expect(lucas).toHaveURL(/\/saldo$/);
});
