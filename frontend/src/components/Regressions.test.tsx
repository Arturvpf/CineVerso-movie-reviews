import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Trends } from './Trends'
import { AdminProblemInbox } from './ProblemCenter'
import { StarRatingInput, StarRatingDisplay } from './StarRatingInput'
import { AvatarImage } from './AvatarImage'
import { moviesApi } from '../services/movies'
import { problemsApi } from '../services/problems'
import { admin, moviePage } from '../test/fixtures'

afterEach(() => vi.restoreAllMocks())

it('mantém tendências visíveis ao selecionar o critério ativo e carrega outro critério', async () => {
  const api = vi.spyOn(moviesApi, 'trending').mockResolvedValue(moviePage)
  render(<Trends user={admin} selectedMovieId={null} onOpenMovie={vi.fn()}
    onCloseMovie={vi.fn()} onReportProblem={vi.fn()} />)
  await screen.findByText('Interestelar')
  await userEvent.click(screen.getByRole('button', { name: 'Mais populares' }))
  expect(screen.queryByText('Carregando tendências…')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Melhores notas' }))
  await screen.findByText('Interestelar')
  expect(api).toHaveBeenLastCalledWith('top_rated', expect.any(AbortSignal))
})

it('mantém a caixa de entrada visível ao clicar no filtro ativo', async () => {
  const api = vi.spyOn(problemsApi, 'inbox').mockResolvedValue({ ...moviePage, items: [], total: 0 })
  render(<AdminProblemInbox />)
  await screen.findByText('Nenhum relato nesta lista')
  await userEvent.click(screen.getByRole('button', { name: 'Abertos' }))
  expect(screen.queryByText('Carregando relatos…')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Resolvidos' }))
  await screen.findByText('Nenhum relato nesta lista')
  expect(api).toHaveBeenLastCalledWith(1, 'resolved', expect.any(AbortSignal))
})

it('oferece somente notas válidas e preserva a apresentação histórica', async () => {
  const change = vi.fn()
  render(<><StarRatingInput value={0} onChange={change} /><StarRatingDisplay value={0.5} /></>)
  expect(screen.queryByRole('button', { name: '0,5 estrelas' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button')).toHaveLength(9)
  await userEvent.click(screen.getByRole('button', { name: '1 estrela' }))
  expect(change).toHaveBeenLastCalledWith(1)
  await userEvent.click(screen.getByRole('button', { name: '4,5 estrelas' }))
  expect(change).toHaveBeenLastCalledWith(4.5)
  expect(screen.getByLabelText('Nota 0,5 de 5 estrelas')).toBeInTheDocument()
})

it('mostra a inicial quando a foto não pode ser carregada', () => {
  const { container } = render(<AvatarImage src="/broken.png" name="Ana" />)
  fireEvent.error(container.querySelector('img')!)
  expect(screen.getByText('A')).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
})
