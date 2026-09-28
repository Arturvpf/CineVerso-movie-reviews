import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Senha', { exact: true }).fill('test-password-12345')
  await page.getByRole('form', { name: 'Login' }).getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Catálogo de filmes' })).toBeVisible()
}

test('administrador cadastra, avalia, edita, filtra e exclui um filme', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: '+ Cadastrar filme', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Título', { exact: true }).fill('Ação E2E')
  await dialog.getByLabel('Diretores').fill('Diretora E2E')
  await dialog.getByLabel('Gêneros').fill('Aventura E2E')
  await dialog.getByLabel('Ano de lançamento').fill('2026')
  await dialog.getByLabel('Sinopse').fill('Uma aventura criada pelo teste de navegador.')
  await dialog.getByRole('button', { name: 'Cadastrar filme', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ação E2E', exact: true })).toBeVisible()
  await expect(page.locator('#genre-filter option')).toContainText(['Todos os gêneros', 'Aventura E2E'])
  await page.getByRole('searchbox').fill('acao e2e')
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
  await page.getByRole('link', { name: 'Ver detalhes de Ação E2E' }).click()
  await expect(page).toHaveURL(/\/filmes\//)
  await page.reload()
  await expect(dialog.getByRole('heading', { name: 'Ação E2E', exact: true })).toBeVisible()
  await dialog.getByLabel('Comentário', { exact: true }).fill('Muito bom, avaliação do navegador.')
  await expect(dialog.getByRole('button', { name: '0,5 estrelas', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '4,5 estrelas', exact: true }).click()
  await dialog.getByRole('button', { name: 'Publicar avaliação' }).click()
  await expect(dialog.getByRole('heading', { name: 'Sua avaliação' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar detalhes' }).click()
  await page.getByLabel('Nota mínima').selectOption('4')
  await page.getByRole('link', { name: 'Ver detalhes de Ação E2E' }).click()
  await dialog.getByRole('button', { name: 'Editar avaliação' }).click()
  await dialog.getByRole('button', { name: '2 estrelas', exact: true }).click()
  await dialog.getByRole('button', { name: 'Salvar avaliação' }).click()
  await expect(dialog.getByText('Avaliação atualizada com sucesso.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar detalhes' }).click()
  await expect(page.getByText('Nenhum filme encontrado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await page.getByRole('button', { name: 'Editar Ação E2E', exact: true }).click()
  await dialog.getByLabel('Título', { exact: true }).fill('Filme editado E2E')
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click()
  await page.getByRole('link', { name: 'Ver detalhes de Filme editado E2E' }).click()
  await dialog.getByRole('button', { name: 'Excluir avaliação', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Nova avaliação' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Excluir filme', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancelar exclusão' }).click()
  await expect(dialog.getByRole('heading', { name: 'Filme editado E2E', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Excluir filme', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click()
  await expect(page.getByText('Sua biblioteca está começando')).toBeVisible()
})

test('catálogo pagina e uma sessão perdida volta ao login', async ({ page }) => {
  await login(page)
  const cookies = await page.context().cookies('http://localhost:8011')
  const csrf = cookies.find(cookie => cookie.name === 'rocketlab_csrf')!.value
  const ids: string[] = []
  try {
    for (let index = 0; index < 13; index++) {
      const response = await page.request.post('http://localhost:8011/api/v1/movies', {
        headers: { 'X-CSRF-Token': csrf },
        data: { titulo: `Paginação ${String(index).padStart(2, '0')}`, ano_lancamento: 2026,
          diretores: ['Diretora'], generos: ['Drama'], sinopse: 'Filme para paginação.' },
      })
      expect(response.status()).toBe(201)
      ids.push((await response.json()).sk_movie_id)
    }
    await page.reload()
    await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Próxima', exact: true }).click()
    await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Paginação 12', exact: true })).toBeVisible()
    await page.getByRole('navigation', { name: 'Seções do projeto' }).getByRole('button', { name: 'Meu perfil' }).click()
    await page.getByRole('button', { name: 'Editar nome', exact: true }).click()
    await page.getByLabel('Nome de exibição').fill('Outro nome')
    await page.context().clearCookies()
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(page.getByRole('form', { name: 'Login' })).toBeVisible()
    await expect(page.getByText('Sua sessão terminou. Entre novamente para continuar.')).toBeVisible()
  } finally {
    await login(page)
    const freshCookies = await page.context().cookies('http://localhost:8011')
    const token = freshCookies.find(cookie => cookie.name === 'rocketlab_csrf')!.value
    for (const id of ids) await page.request.delete(`http://localhost:8011/api/v1/movies/${id}`, {
      headers: { 'X-CSRF-Token': token },
    })
  }
})
