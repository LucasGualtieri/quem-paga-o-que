import { expect, test, type Page } from '@playwright/test';
import { createSplit, guest, joinAs, openCreated } from './helpers.ts';

const toast = (page: Page) => page.locator('.toast-region');
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

/** Lucas cria "Churras de sábado" com Beatriz e Catarina e entra no split. */
async function setup(browser: Parameters<typeof guest>[0], people = ['Beatriz', 'Catarina']) {
  const lucas = await guest(browser);
  const code = await createSplit(lucas, people);
  await openCreated(lucas);
  return { lucas, code };
}

async function startExpense(page: Page, name: string, amount: string) {
  await page.locator('#ad-desc').fill(name);
  await page.locator('#ad-amt').fill(amount);
}

test('estado vazio → lançar despesa igualmente → aparece na hora, com Desfazer', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await expect(lucas.getByText('Nenhuma despesa ainda')).toBeVisible();
  await expect(lucas.getByText('Toque no + para lançar a primeira.')).toBeVisible();
  await shot(lucas, 'tx-vazio');
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await expect(lucas.getByRole('heading', { name: 'Nova despesa' })).toBeVisible();
  await shot(lucas, 'form-vazio');

  // Descrição e valor são obrigatórios.
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(lucas.getByText('Dê um nome para a despesa')).toBeVisible();
  await expect(lucas.getByText('Informe um valor maior que zero')).toBeVisible();

  await startExpense(lucas, 'Pizza', '80');
  // Prévia: 80 ÷ 3 = 26,67, centavos pela ordem de entrada.
  await expect(lucas.locator('.result .big')).toHaveText('R$ 26,67');
  await shot(lucas, 'form-igual');
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();

  await expect(toast(lucas)).toContainText('Despesa adicionada');
  const row = lucas.locator('.txrow', { hasText: 'Pizza' });
  await expect(row).toContainText('R$ 80,00');
  await expect(row).toContainText('Você pagou');
  await expect(row).toContainText('a receber +R$ 53,33');
  await expect(lucas.getByRole('link', { name: 'Adicionar despesa' })).toBeVisible();
  await shot(lucas, 'tx-com-despesa');

  // Desfazer: sai da lista na hora.
  await toast(lucas).getByRole('button', { name: 'Desfazer' }).click();
  await expect(lucas.locator('.txrow')).toHaveCount(0);
  await expect(lucas.getByText('Nenhuma despesa ainda')).toBeVisible();
});

test('frações, porcentagem e valor exato: só salva quando fecha', async ({ browser }) => {
  const { lucas } = await setup(browser, ['Beatriz', 'Catarina', 'Fellipe']);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await startExpense(lucas, 'Pizza', '80');

  await lucas.getByRole('group', { name: 'Como dividir' }).getByRole('button', { name: 'Frações' }).click();
  // Pizza de 8 pedaços: 2, 1, 3, 2 (começa em 1 para cada um).
  const inc = (name: string) => lucas.getByRole('group', { name }).getByRole('button', { name: 'Mais uma parte' });
  await inc('Você').click();
  await inc('Catarina').click();
  await inc('Catarina').click();
  await inc('Fellipe').click();
  await expect(lucas.locator('.inl .row', { hasText: 'Catarina' })).toContainText('R$ 30,00');
  await expect(lucas.locator('.inl .row', { hasText: 'Beatriz' })).toContainText('R$ 10,00');
  await shot(lucas, 'form-fracoes');

  // Porcentagem que não soma 100 não deixa salvar.
  await lucas.getByRole('group', { name: 'Como dividir' }).getByRole('button', { name: 'Porcent.' }).click();
  await lucas.getByLabel('Você', { exact: true }).fill('50');
  await expect(lucas.getByText(/passou|faltam/).first()).toBeVisible();
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(lucas.getByText('A divisão não fecha com o valor. Ajuste os valores acima.')).toBeVisible();
  await expect(lucas.getByRole('heading', { name: 'Nova despesa' })).toBeVisible();
  await shot(lucas, 'form-pct-erro');

  // Valor exato que fecha salva.
  await lucas.getByRole('group', { name: 'Como dividir' }).getByRole('button', { name: 'Valor exato' }).click();
  await lucas.getByLabel('Você', { exact: true }).fill('50');
  await lucas.getByLabel('Beatriz', { exact: true }).fill('10');
  await lucas.getByLabel('Catarina', { exact: true }).fill('10');
  await lucas.getByLabel('Fellipe', { exact: true }).fill('10');
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  await expect(lucas.locator('.txrow', { hasText: 'Pizza' })).toContainText('valores exatos');
});

test('dividir por itens com resto da compra', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await startExpense(lucas, 'Mercado', '100');
  await lucas.getByRole('button', { name: /Dividir por itens/ }).click();

  await lucas.getByLabel('Nome do item').fill('Cerveja');
  await lucas.getByLabel('Valor do item').fill('30');
  // Só Lucas e Beatriz tomaram cerveja: tira Catarina.
  await lucas.getByRole('group', { name: 'Quem consumiu Cerveja' }).getByRole('button', { name: 'Catarina' }).click();
  // O resto (R$ 70) vai para os três.
  await expect(lucas.locator('.itemcard.rest')).toContainText('R$ 70,00');
  await shot(lucas, 'form-itens');
  await lucas.getByRole('button', { name: 'Adicionar item' }).click();
  await expect(lucas.locator('.itemcard').first().locator('.imin')).toBeVisible();

  // Item sem valor: o aviso aparece ao tentar salvar e o item reabre sozinho.
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(lucas.getByText('Informe o valor do item')).toBeVisible();
  await lucas.getByLabel('Valor do item').last().fill('0');
  await lucas.getByRole('button', { name: 'Remover Item 2' }).click();
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(toast(lucas)).toContainText('Despesa adicionada');
  await expect(lucas.locator('.txrow', { hasText: 'Mercado' })).toContainText('por itens');

  await lucas.locator('.txrow', { hasText: 'Mercado' }).click();
  await expect(lucas.getByRole('heading', { name: 'Itens' })).toBeVisible();
  await expect(lucas.getByText('Cerveja')).toBeVisible();
  await shot(lucas, 'detalhe-itens');
});

test('detalhe, editar com histórico, excluir com Desfazer', async ({ browser }) => {
  const { lucas } = await setup(browser);
  await lucas.getByRole('button', { name: 'Adicionar despesa' }).click();
  await startExpense(lucas, 'Gasolina', '120');
  await lucas.getByRole('button', { name: /Mais detalhes/ }).click();
  await lucas.getByRole('button', { name: 'Transporte' }).click();
  await lucas.locator('#ad-note').fill('Ida e volta');
  await lucas.getByRole('button', { name: /Salvar despesa/ }).click();

  await lucas.locator('.txrow', { hasText: 'Gasolina' }).click();
  await expect(lucas.getByRole('heading', { name: 'Gasolina' })).toBeVisible();
  await expect(lucas.getByText('Ida e volta')).toBeVisible();
  await expect(lucas.getByText('Criada por Lucas · R$ 120,00')).toBeVisible();
  await expect(lucas.getByText('2 pendentes')).toBeVisible();
  await shot(lucas, 'detalhe');

  await lucas.getByRole('link', { name: 'Editar', exact: true }).first().click();
  await expect(lucas.locator('#ad-desc')).toHaveValue('Gasolina');
  await lucas.locator('#ad-amt').fill('150');
  await lucas.getByRole('button', { name: /Salvar alterações/ }).click();
  await expect(lucas.getByText('R$ 150,00').first()).toBeVisible();
  await expect(lucas.getByText('Lucas mudou o valor de R$ 120,00 para R$ 150,00')).toBeVisible();

  await lucas.getByRole('button', { name: 'Excluir' }).first().click();
  await expect(lucas.getByRole('dialog', { name: 'Excluir “Gasolina”?' })).toBeVisible();
  await lucas.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(toast(lucas)).toContainText('Despesa excluída');
  await expect(lucas.locator('.txrow')).toHaveCount(0);
  await toast(lucas).getByRole('button', { name: 'Desfazer' }).click();
  await expect(lucas.locator('.txrow', { hasText: 'Gasolina' })).toContainText('R$ 150,00');
});

test('busca e filtros por pessoa e tag, com contagem', async ({ browser }) => {
  const { lucas } = await setup(browser);
  for (const [name, amount, tag] of [['Pizza', '60', 'Comida'], ['Cerveja', '30', 'Bebidas'], ['Pão', '9', 'Comida']] as const) {
    await lucas.getByRole('link', { name: 'Adicionar despesa' }).or(lucas.getByRole('button', { name: 'Adicionar despesa' })).click();
    await startExpense(lucas, name, amount);
    await lucas.getByRole('button', { name: /Mais detalhes/ }).click();
    await lucas.getByRole('button', { name: tag, exact: true }).click();
    await lucas.getByRole('button', { name: /Salvar despesa/ }).click();
    await expect(lucas.locator('.txrow', { hasText: name })).toBeVisible();
  }
  await lucas.getByRole('searchbox', { name: 'Buscar' }).fill('cerv');
  await expect(lucas.locator('.txrow')).toHaveCount(1);
  await lucas.getByRole('searchbox', { name: 'Buscar' }).fill('comida');
  await expect(lucas.locator('.txrow')).toHaveCount(2);
  await lucas.getByRole('searchbox', { name: 'Buscar' }).fill('');

  await lucas.getByRole('button', { name: /^Tags/ }).click();
  await expect(lucas.getByRole('button', { name: /Comida/ })).toContainText('2');
  await lucas.getByRole('button', { name: /Bebidas/ }).click();
  await shot(lucas, 'filtros');
  await lucas.getByRole('button', { name: 'Ver 1 despesa' }).click();
  await expect(lucas.locator('.txrow')).toHaveCount(1);
  await expect(lucas.locator('.txrow')).toContainText('Cerveja');
  await lucas.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(lucas.locator('.txrow')).toHaveCount(3);
});

test('membro lança, mas só autor ou admin edita; as outras pessoas veem o aviso', async ({ browser }) => {
  const { lucas, code } = await setup(browser);
  const bia = await joinAs(browser, code, 'Beatriz');
  await bia.getByRole('button', { name: 'Adicionar despesa' }).click();
  await startExpense(bia, 'Sorvete', '12');
  await bia.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(bia.locator('.txrow', { hasText: 'Sorvete' })).toContainText('R$ 12,00');
  // Em tempo real no outro aparelho.
  await expect(lucas.locator('.txrow', { hasText: 'Sorvete' })).toBeVisible();

  await lucas.locator('.txrow', { hasText: 'Sorvete' }).click();
  await expect(lucas.getByRole('link', { name: 'Editar', exact: true }).first()).toBeVisible();

  // Catarina entra, não é autora nem admin.
  const cat = await joinAs(browser, code, 'Catarina');
  await cat.locator('.txrow', { hasText: 'Sorvete' }).click();
  await expect(cat.getByText('Só Beatriz (quem lançou) ou um admin pode editar.')).toBeVisible();
  await expect(cat.getByRole('link', { name: 'Editar' })).toHaveCount(0);
});

test('duas pessoas editando a mesma despesa: aviso de conflito, ver a nova ou salvar por cima', async ({ browser }) => {
  const { lucas, code } = await setup(browser);
  const bia = await joinAs(browser, code, 'Beatriz');
  await bia.getByRole('button', { name: 'Adicionar despesa' }).click();
  await startExpense(bia, 'Sorvete', '12');
  await bia.getByRole('button', { name: /Salvar despesa/ }).click();
  await expect(bia.locator('.txrow', { hasText: 'Sorvete' })).toBeVisible();

  // Lucas (admin) abre a edição; Beatriz salva antes dele.
  await lucas.locator('.txrow', { hasText: 'Sorvete' }).click();
  await lucas.getByRole('link', { name: 'Editar', exact: true }).first().click();
  await expect(lucas.locator('#ad-desc')).toHaveValue('Sorvete');

  await bia.locator('.txrow', { hasText: 'Sorvete' }).click();
  await bia.getByRole('link', { name: 'Editar', exact: true }).first().click();
  await bia.locator('#ad-amt').fill('15');
  await bia.getByRole('button', { name: /Salvar alterações/ }).click();
  await expect(bia.getByText('R$ 15,00').first()).toBeVisible();

  await lucas.locator('#ad-amt').fill('20');
  await lucas.getByRole('button', { name: /Salvar alterações/ }).click();
  const sheet = lucas.getByRole('dialog', { name: 'Beatriz alterou esta despesa enquanto você editava.' });
  await expect(sheet).toBeVisible();
  await shot(lucas, 'conflito');
  // A versão da Beatriz continua valendo enquanto ele decide.
  await sheet.getByRole('button', { name: 'Ver a versão nova' }).click();
  await expect(lucas.getByText('R$ 15,00').first()).toBeVisible();

  // De novo, agora salvando por cima.
  await lucas.getByRole('link', { name: 'Editar', exact: true }).first().click();
  await lucas.locator('#ad-amt').fill('20');
  await bia.locator('#ad-amt').count();
  await lucas.getByRole('button', { name: /Salvar alterações/ }).click();
  await expect(lucas.getByText('R$ 20,00').first()).toBeVisible();
  await expect(lucas.getByText('Lucas mudou o valor de R$ 15,00 para R$ 20,00')).toBeVisible();
});
