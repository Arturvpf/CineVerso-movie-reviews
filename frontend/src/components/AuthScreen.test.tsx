import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi, type User } from '../services/auth'
import { AuthScreen } from './AuthScreen'

const account: User = {
  id: 'user-1', email: 'ana@example.com', display_name: 'Ana', role: 'user',
  created_at: '2026-01-01T00:00:00', avatar_url: null,
}

afterEach(() => vi.restoreAllMocks())

it('entra na conta e entrega a sessão à aplicação', async () => {
  const login = vi.spyOn(authApi, 'login').mockResolvedValue(account)
  const authenticated = vi.fn()
  const interaction = userEvent.setup()
  render(<AuthScreen onAuthenticated={authenticated} />)

  await interaction.type(screen.getByRole('textbox', { name: 'Email' }), account.email)
  await interaction.type(screen.getByLabelText('Senha'), 'senha-de-teste-segura')
  await interaction.click(within(screen.getByRole('form', { name: 'Login' }))
    .getByRole('button', { name: 'Entrar' }))

  expect(login).toHaveBeenCalledWith(account.email, 'senha-de-teste-segura')
  expect(authenticated).toHaveBeenCalledWith(account)
})

it('impede cadastro quando as senhas não coincidem', async () => {
  const register = vi.spyOn(authApi, 'register')
  const interaction = userEvent.setup()
  render(<AuthScreen onAuthenticated={vi.fn()} />)

  await interaction.click(within(screen.getByRole('group', { name: 'Acesso à conta' }))
    .getByRole('button', { name: 'Criar conta' }))
  await interaction.type(screen.getByRole('textbox', { name: 'Como podemos chamar você?' }), 'Ana')
  await interaction.type(screen.getByRole('textbox', { name: 'Email' }), account.email)
  await interaction.type(screen.getByLabelText('Senha', { exact: true }), 'senha-de-teste-segura')
  await interaction.type(screen.getByLabelText('Confirme sua senha'), 'outra-senha-segura')
  await interaction.click(screen.getByRole('button', { name: 'Criar minha conta' }))

  expect(screen.getByRole('alert')).toHaveTextContent('As senhas não coincidem')
  expect(register).not.toHaveBeenCalled()
})
