import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi, type User } from './services/auth'
import App from './App'

vi.mock('./components/Catalog', () => ({ Catalog: () => null }))

const account: User = {
  id: 'user-1', email: 'ana@example.com', display_name: 'Ana', role: 'user',
  created_at: '2026-01-01T00:00:00', avatar_url: null,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

it('atualiza o nome no cabeçalho e preserva a escolha de tema', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
  vi.spyOn(authApi, 'me').mockResolvedValue(account)
  vi.spyOn(authApi, 'updateProfile').mockResolvedValue({ ...account, display_name: 'Ana Maria' })
  const interaction = userEvent.setup()
  render(<App />)

  await screen.findByRole('button', { name: 'Ativar modo escuro' })
  await interaction.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(window.localStorage.getItem('cineverso-theme')).toBe('dark')

  await interaction.click(within(screen.getByRole('navigation', { name: 'Seções do projeto' }))
    .getByRole('button', { name: 'Meu perfil' }))
  await interaction.click(screen.getByRole('button', { name: 'Editar nome' }))
  await interaction.clear(screen.getByRole('textbox', { name: 'Nome de exibição' }))
  await interaction.type(screen.getByRole('textbox', { name: 'Nome de exibição' }), 'Ana Maria')
  await interaction.click(screen.getByRole('button', { name: 'Salvar nome' }))

  expect(await screen.findByRole('button', { name: /Ana Maria/ })).toBeInTheDocument()
})
