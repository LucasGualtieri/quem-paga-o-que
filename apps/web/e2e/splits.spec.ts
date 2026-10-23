import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest } from './helpers.ts';

async function joinByCode(page: Page, code: string) {
  await page.getByRole('link', { name: 'Entrar com código ou link' }).click();
  await page.getByLabel('Código ou link').fill(code.toLowerCase().replace('-', ' '));
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Quem é você?' })).toBeVisible();
}

/** O toast (a home também tem o aviso de convidado como role=status). */
const toast = (page: Page) => page.locator('.toast-region');

const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

test('cria split → convida → outro navegador entra pelo código e escolhe o nome', async ({ browser }) => {
  const lucas = await guest(browser);
  await shot(lucas, 'home-vazia');
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  await shot(lucas, 'split-criado');

  const bia = await guest(browser);
  await joinByCode(bia, code);
  await expect(bia.getByText('3 pessoas · criado por Lucas')).toBeVisible();
  // Lucas já entrou: o nome dele trava (decisão 3).
  await expect(bia.getByRole('radio', { name: /Lucas/ })).toBeDisabled();
  await expect(bia.getByText('já entrou')).toBeVisible();
  await bia.getByRole('radio', { name: /Beatriz/ }).check();
  await shot(bia, 'quem-e-voce');
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(toast(bia)).toContainText('Você entrou em Churras de sábado');
  await bia.getByRole('link', { name: /Pessoas/ }).click();
  await expect(bia.getByText('Só admins gerenciam pessoas')).toBeVisible();
  await expect(bia.getByText(/fale com Lucas\./)).toBeVisible();
  await shot(bia, 'pessoas-membro');

  // Do lado do Lucas, em tempo real: Beatriz entrou e pode virar admin.
  await lucas.getByRole('link', { name: 'Ir para o split' }).click();
  await lucas.getByRole('link', { name: /Pessoas/ }).click();
  const biaRow = lucas.locator('.row2', { hasText: 'Beatriz' });
  await expect(biaRow).not.toContainText('ainda não entrou');
  await expect(lucas.locator('.row2', { hasText: 'Catarina' })).toContainText('ainda não entrou');
  await expect(lucas.locator('.row2', { hasText: 'Catarina' }).getByRole('button', { name: 'Tornar admin' })).toHaveCount(0);
  await shot(lucas, 'pessoas-admin');
});

test('nome travado, nome repetido e "Não estou na lista"', async ({ browser }) => {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz']);

  const ze = await guest(browser);
  await ze.goto(`./#/convite/${code}`);
  await ze.getByRole('button', { name: 'Não estou na lista' }).click();
  await ze.getByLabel('Seu nome').fill('beatríz');
  await expect(ze.getByText('Já tem alguém chamado Beatriz aqui.', { exact: false })).toBeVisible();
  await expect(ze.getByRole('button', { name: /Entrar como/ })).toBeDisabled();
  await ze.getByLabel('Seu nome').fill('Zé');
  await ze.getByRole('button', { name: 'Entrar como Zé' }).click();
  await expect(toast(ze)).toContainText('Você entrou como Zé em Churras de sábado');

  await lucas.getByRole('link', { name: 'Ir para o split' }).click();
  await lucas.getByRole('link', { name: /Pessoas/ }).click();
  await expect(lucas.locator('.row2', { hasText: 'Zé' })).toContainText('chegou pelo convite');
});

test('admin promove, deixa de ser admin, libera nome e remove; membro sai do split', async ({ browser }) => {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz', 'Catarina']);
  const bia = await guest(browser);
  await joinByCode(bia, code);
  await bia.getByRole('radio', { name: /Beatriz/ }).check();
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(toast(bia)).toContainText('Você entrou');

  await lucas.getByRole('link', { name: 'Ir para o split' }).click();
  await lucas.getByRole('link', { name: /Pessoas/ }).click();

  // Último admin não sai do papel.
  await lucas.getByRole('button', { name: 'Deixar de ser admin' }).click();
  await expect(lucas.getByRole('alert')).toContainText('Promova outra pessoa a admin antes.');

  // Promover é otimista: o selo muda na hora.
  const biaRow = lucas.locator('.row2', { hasText: 'Beatriz' });
  await biaRow.getByRole('button', { name: 'Tornar admin' }).click();
  await expect(biaRow.getByText('Admin', { exact: true })).toBeVisible();
  await bia.getByRole('link', { name: /Pessoas/ }).click();
  await expect(bia.getByText('Convidar por link')).toBeVisible();

  // Remover quem não entrou e está quitado.
  await lucas.locator('.row2', { hasText: 'Catarina' }).getByRole('button', { name: 'Remover Catarina' }).click();
  await expect(toast(lucas)).toContainText('Catarina foi removido');
  await expect(lucas.locator('.row2', { hasText: 'Catarina' })).toHaveCount(0);

  // Agora com outro admin, Lucas pode deixar de ser admin.
  await lucas.getByRole('button', { name: 'Deixar de ser admin' }).click();
  await expect(lucas.getByText('Só admins gerenciam pessoas')).toBeVisible();

  // Beatriz (admin) libera o nome do Lucas: ele perde o acesso e volta para a home.
  const lucasRow = bia.locator('.row2', { hasText: 'Lucas' });
  await lucasRow.getByRole('button', { name: 'Liberar nome' }).click();
  await expect(toast(bia)).toContainText('O nome Lucas ficou livre');
  await expect(lucas.getByRole('heading', { name: 'Meus splits' })).toBeVisible();

  // Beatriz é a única admin: não consegue sair.
  await bia.getByRole('button', { name: 'Mais opções' }).click();
  await bia.getByRole('menuitem', { name: 'Sair do split' }).click();
  await expect(bia.getByRole('dialog')).toContainText('Promova outra pessoa a admin antes.');
  await bia.keyboard.press('Escape');
});

test('membro sai do split: some da home na hora', async ({ browser }) => {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, ['Beatriz']);
  const bia = await guest(browser);
  await joinByCode(bia, code);
  await bia.getByRole('radio', { name: /Beatriz/ }).check();
  await bia.getByRole('button', { name: 'Entrar como Beatriz' }).click();
  await expect(toast(bia)).toContainText('Você entrou');

  await bia.getByRole('button', { name: 'Mais opções' }).click();
  await bia.getByRole('menuitem', { name: 'Sair do split' }).click();
  await expect(bia.getByRole('dialog', { name: 'Sair de “Churras de sábado”?' })).toBeVisible();
  await shot(bia, 'sair-do-split');
  await bia.getByRole('dialog').getByRole('button', { name: 'Sair do split' }).click();
  await expect(bia.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
  await expect(toast(bia)).toContainText('Você saiu de Churras de sábado');
  await expect(bia.locator('.home-card', { hasText: 'Churras de sábado' })).toHaveCount(0);

  // A home do Lucas mostra o split com saldo quitado.
  await lucas.goto('./#/');
  await expect(lucas.locator('.home-card', { hasText: 'Churras de sábado' })).toContainText('Quitado');
  await shot(lucas, 'home-com-split');
});
