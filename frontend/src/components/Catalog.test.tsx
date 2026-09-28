import { useState } from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Catalog } from './Catalog'
import { moviesApi } from '../services/movies'
import { admin, movie, moviePage, review, emptyReviews } from '../test/fixtures'
import type { MovieDetail } from '../types/movie'

beforeEach(() => {
  vi.spyOn(moviesApi, 'list').mockResolvedValue(moviePage)
  vi.spyOn(moviesApi, 'genres').mockResolvedValue(['Drama'])
  vi.spyOn(moviesApi, 'get').mockResolvedValue(movie)
  vi.spyOn(moviesApi, 'reviews').mockResolvedValue(emptyReviews)
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function Host({ ordinary = false }: { ordinary?: boolean }) {
  const [id, setId] = useState<string | null>(null)
  return <Catalog user={ordinary ? { ...admin, role: 'user' } : admin} selectedMovieId={id}
    onOpenMovie={setId} onCloseMovie={() => setId(null)} onReportProblem={vi.fn()} />
}

it('cadastra, atualiza gêneros, edita e exclui um filme pela interface', async () => {
  let saved: MovieDetail | null = null
  vi.mocked(moviesApi.list).mockImplementation(async () => ({ ...moviePage,
    items: saved ? [saved] : [], total: saved ? 1 : 0 }))
  vi.mocked(moviesApi.genres).mockImplementation(async () => saved?.generos ?? [])
  const create = vi.spyOn(moviesApi, 'create').mockImplementation(async (payload) => {
    saved = { ...movie, ...payload }
    return saved
  })
  vi.mocked(moviesApi.get).mockImplementation(async () => saved!)
  const update = vi.spyOn(moviesApi, 'update').mockImplementation(async (_id, payload) => {
    saved = { ...saved!, ...payload }
    return saved
  })
  const remove = vi.spyOn(moviesApi, 'remove').mockImplementation(async () => { saved = null })
  render(<Host />)
  await screen.findByText('Sua biblioteca está começando')
  await userEvent.click(screen.getByRole('button', { name: '+ Cadastrar filme' }))
  const editor = screen.getByRole('dialog')
  for (const [label, value] of [['Título', 'Filme novo'], ['Diretores', 'Diretora'],
    ['Gêneros', 'Aventura'], ['Ano de lançamento', '2026'], ['Sinopse', 'Uma nova história.']]) {
    await userEvent.type(within(editor).getByLabelText(label), value)
  }
  await userEvent.click(within(editor).getByRole('button', { name: 'Cadastrar filme' }))
  await screen.findByRole('heading', { name: 'Filme novo' })
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Filme novo', generos: ['Aventura'] }))
  await waitFor(() => expect(within(screen.getByLabelText('Gênero')).getByRole('option', { name: 'Aventura' })).toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: 'Editar Filme novo' }))
  const title = await screen.findByLabelText('Título')
  await userEvent.clear(title)
  await userEvent.type(title, 'Filme editado')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await screen.findByRole('heading', { name: 'Filme editado' })
  expect(update).toHaveBeenCalledWith(movie.sk_movie_id, { titulo: 'Filme editado' })

  await userEvent.click(screen.getByRole('link', { name: 'Ver detalhes de Filme editado' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir filme' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Excluir filme' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByText('Sua biblioteca está começando')
  expect(remove).toHaveBeenCalledWith(movie.sk_movie_id)
  expect(screen.queryByRole('option', { name: 'Aventura' })).not.toBeInTheDocument()
})

it('pesquisa, pagina e combina filtros reiniciando a página', async () => {
  vi.mocked(moviesApi.list).mockImplementation(async (query) => ({ ...moviePage,
    page: query?.page ?? 1, total: 24, total_pages: 2 }))
  render(<Host />)
  await screen.findByText('Página 1 de 2')
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  await screen.findByText('Página 2 de 2')
  await userEvent.type(screen.getByRole('searchbox'), 'Nolan')
  await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
  await screen.findByText('Página 1 de 2')
  expect(moviesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Nolan', page: 1 }), expect.any(AbortSignal))
  await userEvent.selectOptions(screen.getByLabelText('Gênero'), 'Drama')
  await userEvent.selectOptions(screen.getByLabelText('Nota mínima'), '4')
  await waitFor(() => expect(moviesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({
    q: 'Nolan', genre: 'Drama', min_rating: 4, page: 1,
  }), expect.any(AbortSignal)))
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(screen.getByRole('searchbox')).toHaveValue('')
})

it('reaplica o filtro de nota após editar uma avaliação nos detalhes', async () => {
  let rating = 4
  vi.mocked(moviesApi.list).mockImplementation(async (query) => ({ ...moviePage,
    items: query?.min_rating && rating < query.min_rating ? [] : [{ ...movie, media_avaliacoes: rating }],
    total: query?.min_rating && rating < query.min_rating ? 0 : 1,
  }))
  vi.mocked(moviesApi.reviews).mockImplementation(async () => ({ ...emptyReviews,
    items: [{ ...review, nota: rating }], total: 1, total_pages: 1,
    media_avaliacoes: rating, my_review_id: review.sk_movie_review_id }))
  vi.spyOn(moviesApi, 'updateReview').mockImplementation(async (_id, _reviewId, changes) => {
    rating = changes.nota!
    return { ...review, nota: rating }
  })
  render(<Host />)
  await screen.findByText('Interestelar')
  await userEvent.selectOptions(screen.getByLabelText('Nota mínima'), '4')
  await userEvent.click(await screen.findByRole('link', { name: 'Ver detalhes de Interestelar' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Editar avaliação' }))
  await userEvent.click(screen.getByRole('button', { name: '2 estrelas' }))
  await userEvent.click(screen.getByRole('button', { name: 'Salvar avaliação' }))
  await screen.findByText('Avaliação atualizada com sucesso.')
  await userEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }))
  await screen.findByText('Nenhum filme encontrado')
  expect(screen.queryByRole('link', { name: 'Ver detalhes de Interestelar' })).not.toBeInTheDocument()
})

it('apresenta falha de consulta e permite tentar novamente', async () => {
  vi.mocked(moviesApi.list).mockRejectedValueOnce(new Error('Falha no catálogo.'))
  render(<Host />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha no catálogo.')
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByText('Interestelar')
})

it('não oferece gerenciamento do catálogo para uma conta comum', async () => {
  render(<Host ordinary />)
  await screen.findByText('Interestelar')
  expect(screen.queryByRole('button', { name: /Cadastrar filme/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Editar Interestelar' })).not.toBeInTheDocument()
})
