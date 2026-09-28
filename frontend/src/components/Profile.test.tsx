import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi, type User } from '../services/auth'
import { Profile } from './Profile'

const account: User = {
  id: 'user-1', email: 'ana@example.com', display_name: 'Ana', role: 'user',
  created_at: '2026-01-01T00:00:00', avatar_url: null,
}

afterEach(() => vi.restoreAllMocks())

function ProfileHost() {
  const [user, setUser] = useState(account)
  return <Profile user={user} onUpdated={setUser} />
}

it('salva o nome na conta e mostra o valor retornado pela API', async () => {
  const update = vi.spyOn(authApi, 'updateProfile').mockResolvedValue({
    ...account, display_name: 'Ana Maria',
  })
  const interaction = userEvent.setup()
  render(<ProfileHost />)

  await interaction.click(screen.getByRole('button', { name: 'Editar nome' }))
  await interaction.clear(screen.getByRole('textbox', { name: 'Nome de exibição' }))
  await interaction.type(screen.getByRole('textbox', { name: 'Nome de exibição' }), '  Ana Maria  ')
  await interaction.click(screen.getByRole('button', { name: 'Salvar nome' }))

  expect(update).toHaveBeenCalledWith('Ana Maria')
  expect(await screen.findByText('Nome de exibição atualizado.')).toBeInTheDocument()
  expect(screen.getByText('Ana Maria')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Nome de exibição' })).not.toBeInTheDocument()
})

it('mantém o formulário aberto e o nome anterior quando a API falha', async () => {
  vi.spyOn(authApi, 'updateProfile').mockRejectedValue(new Error('Falha ao salvar.'))
  const interaction = userEvent.setup()
  render(<ProfileHost />)

  await interaction.click(screen.getByRole('button', { name: 'Editar nome' }))
  await interaction.clear(screen.getByRole('textbox', { name: 'Nome de exibição' }))
  await interaction.type(screen.getByRole('textbox', { name: 'Nome de exibição' }), 'Outro nome')
  await interaction.click(screen.getByRole('button', { name: 'Salvar nome' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar.')
  expect(screen.getByRole('textbox', { name: 'Nome de exibição' })).toHaveValue('Outro nome')
  expect(screen.getByText('Ana')).toBeInTheDocument()
})
