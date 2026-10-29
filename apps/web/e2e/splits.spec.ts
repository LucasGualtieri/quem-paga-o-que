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

  // Último admin: a folha avisa para quem o papel vai (decisão 4, revista); cancelar não muda nada.
  await lucas.getByRole('button', { name: 'Deixar de ser admin' }).click();
  await expect(lucas.getByRole('dialog', { name: 'Deixar de ser admin?' })).toContainText('Beatriz vira admin no seu lugar.');
  await shot(lucas, 'deixar-de-ser-admin');
  await lucas.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

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
  await lucasRow.getByRole('button', { name: 'Liberar nome', exact: true }).click();
  await expect(toast(bia)).toContainText('O nome Lucas ficou livre');
  await expect(lucas.getByRole('heading', { name: 'Meus splits' })).toBeVisible();

  // Beatriz é a única admin e ninguém mais entrou: pode sair, e o próximo que entrar vira admin.
  await bia.getByRole('button', { name: 'Mais opções' }).click();
  await bia.getByRole('menuitem', { name: 'Sair do split' }).click();
  await expect(bia.getByRole('dialog')).toContainText('a próxima pessoa que entrar no split vira admin');
  await bia.getByRole('dialog').getByRole('button', { name: 'Sair do split' }).click();
  await expect(bia.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
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

test('criar split: nome digitado sem o "+" entra junto e os nomes adicionados se editam', async ({ browser }) => {
  const lucas = await guest(browser);
  await lucas.getByRole('link', { name: 'Novo split' }).click();
  await lucas.getByLabel('Nome do split *').fill('Ano Novo');
  await lucas.getByLabel('Seu nome').fill('Lucas');
  await lucas.getByRole('textbox', { name: 'Nome do amigo' }).fill('Beatriz');
  await lucas.getByRole('button', { name: 'Adicionar' }).click();
  // Repetido trava o botão e mostra o erro; corrigido, libera.
  await lucas.getByRole('textbox', { name: 'Nome do participante 1' }).fill('lucas');
  await lucas.getByRole('textbox', { name: 'Nome do amigo' }).click();
  await expect(lucas.getByRole('alert')).toContainText('Lucas');
  await expect(lucas.getByRole('button', { name: 'Criar split' })).toBeDisabled();
  await lucas.getByRole('textbox', { name: 'Nome do participante 1' }).fill('Bia');
  await lucas.getByRole('textbox', { name: 'Nome do amigo' }).fill('Fillipe');
  await lucas.getByRole('button', { name: 'Criar split' }).click();
  await expect(lucas.getByRole('heading', { name: '“Ano Novo” está pronto!' })).toBeVisible();
  await lucas.getByRole('link', { name: 'Ir para o split' }).click();
  await lucas.getByRole('link', { name: 'Pessoas' }).click();
  await expect(lucas.locator('main')).toContainText('Bia');
  await expect(lucas.locator('main')).toContainText('Fillipe');
});
