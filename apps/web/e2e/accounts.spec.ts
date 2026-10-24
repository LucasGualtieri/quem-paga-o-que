import { expect, test, type Browser, type Page } from '@playwright/test';
import { createSplit, guest } from './helpers.ts';

const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
const uniqueEmail = () => `qpq-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;

async function signUp(page: Page, email: string) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('senha-123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

/** Uma conta criada pela tela de entrada (não é convidado). */
async function account(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Criar conta com e-mail' }).click();
  await signUp(page, email);
  await expect(page.getByRole('heading', { name: 'Meus splits' })).toBeVisible();
  await expect(page.getByText('Você está sem conta.')).toHaveCount(0);
  return page;
}

test('tela de entrada: conta é opcional', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /Quem Paga/ })).toBeVisible();
  await expect(page.getByText('8 partes')).toBeVisible();
  await shot(page, 'entrada');
  await page.getByRole('button', { name: 'Continuar sem conta' }).click();
  await expect(page.getByText('Você está sem conta. Seus splits ficam salvos neste aparelho.')).toBeVisible();
});

test('convidado cria split → salva com e-mail → splits continuam', async ({ browser }) => {
  const page = await guest(browser);
  await createSplit(page, ['Beatriz']);
  // Lembrete para o convidado admin (spec 03); "Agora não" fecha e não volta na sessão.
  await expect(page.getByText('Salve sua conta para não perder este split')).toBeVisible();
  await shot(page, 'lembrete-salvar');
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page.getByText('Salve sua conta para não perder este split')).toHaveCount(0);

  await page.getByRole('link', { name: 'Ir para o split' }).click();
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Salvar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Não perca seus splits' })).toBeVisible();
  await expect(page.locator('.linkbox .amt')).toContainText('#/r/');
  await shot(page, 'link-recuperacao');
  await page.getByRole('link', { name: 'Criar conta com e-mail' }).click();
  await signUp(page, uniqueEmail());
  await expect(toast(page)).toContainText('Conta salva');
  await expect(page.getByText('Você está sem conta.')).toHaveCount(0);
  await expect(page.locator('.home-card', { hasText: 'Churras de sábado' })).toBeVisible();
});

test('conta já existe: os splits vêm junto e, no mesmo split, a pessoa escolhe o nome', async ({ browser }) => {
  const email = uniqueEmail();
  const acc = await account(browser, email);
  const code = await createSplit(acc, ['Lucas G.']);

  const page = await guest(browser);
  await page.goto(`./#/convite/${code}`);
  await page.getByRole('radio', { name: /Lucas G\./ }).check();
  await page.getByRole('button', { name: 'Entrar como Lucas G.' }).click();
  await expect(toast(page)).toContainText('Você entrou');
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Novo split' }).click();
  await page.getByLabel('Nome do split *').fill('Viagem');
  await page.getByLabel('Seu nome').fill('Lucas G.');
  await page.getByRole('button', { name: 'Criar split' }).click();
  await expect(page.locator('.code-row .amt')).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

  // O convidado entra na conta que já existia.
  await page.goto('./#/email');
  await page.getByRole('button', { name: 'Já tenho conta · Entrar' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('senha-123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Juntar seus splits' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Juntar contas' })).toBeDisabled();
  await shot(page, 'juntar');
  await page.getByRole('radio', { name: /Lucas G\..*deste aparelho/ }).check();
  await page.getByRole('button', { name: 'Juntar contas' }).click();
  await expect(toast(page)).toContainText('Seus splits vieram para a sua conta');
  await expect(page.locator('.home-card', { hasText: 'Churras de sábado' })).toBeVisible();
  await expect(page.locator('.home-card', { hasText: 'Viagem' })).toBeVisible();

  // No split dos dois lados, ficou "Lucas G." como admin (herdou de "Lucas"); "Lucas" ficou livre.
  await page.locator('.home-card', { hasText: 'Churras de sábado' }).click();
  await page.getByRole('link', { name: /Pessoas/ }).click();
  await expect(page.locator('.row2', { hasText: 'Lucas G. (você)' })).toContainText('Admin');
  await expect(page.locator('.row2').filter({ has: page.locator('.ttl', { hasText: /^Lucas$/ }) })).toContainText('ainda não entrou');
});

test('link de recuperação devolve a identidade; preferências vão junto; revogado não vale', async ({ browser }) => {
  const page = await guest(browser);
  await createSplit(page, ['Beatriz']);
  await page.goto('./#/conta');
  await page.getByRole('group', { name: 'Tema' }).getByRole('button', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
  await shot(page, 'sua-conta-convidado');

  await page.goto('./#/salvar');
  // O link chega da Function depois que a tela abre: espera ele aparecer antes de ler.
  await expect(page.locator('.linkbox .amt')).toContainText('#/r/', { timeout: 15_000 });
  const link = (await page.locator('.linkbox .amt').textContent())!;

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(toast(other)).toContainText('Bem-vindo de volta');
  await expect(other.locator('.home-card', { hasText: 'Churras de sábado' })).toBeVisible();
  // Tema salvo na conta vale no outro aparelho (spec 08).
  await expect(other.locator('html')).toHaveClass(/theme-dark/);

  await page.goto('./#/conta');
  await page.getByRole('button', { name: 'Revogar link' }).click();
  await expect(toast(page)).toContainText('Link de recuperação revogado');

  const third = await (await browser.newContext()).newPage();
  await third.goto(link);
  await expect(third.getByRole('alert')).toContainText('Este link de recuperação não vale mais');
});

test('convidado que sai da conta é avisado antes', async ({ browser }) => {
  const page = await guest(browser);
  await page.goto('./#/conta');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('dialog', { name: 'Sair sem conta?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Sair mesmo assim' }).click();
  await expect(page.getByRole('button', { name: 'Continuar sem conta' })).toBeVisible();
});

test('gerar novo código: o antigo para de funcionar (decisão 6)', async ({ browser }) => {
  const page = await guest(browser);
  const code = await createSplit(page, ['Beatriz']);
  await page.getByRole('link', { name: 'Ir para o split' }).click();
  await page.getByRole('link', { name: /Pessoas/ }).click();
  await page.getByRole('button', { name: 'Gerar novo código' }).click();
  await expect(page.getByRole('dialog', { name: 'Gerar novo código?' })).toContainText('Quem já entrou continua no split.');
  await page.getByRole('dialog').getByRole('button', { name: 'Gerar novo código' }).click();
  await expect(toast(page)).toContainText('Código novo gerado');
  await expect(page.locator('.code-row .amt')).not.toHaveText(code);

  const ze = await guest(browser);
  await ze.goto(`./#/convite/${code}`);
  await expect(ze.getByRole('alert')).toContainText('Não achamos esse convite');
});
