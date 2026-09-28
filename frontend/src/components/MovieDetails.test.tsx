import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MovieDetails } from './MovieDetails'
import { moviesApi } from '../services/movies'
import { ApiError } from '../services/http'
import { admin, movie, review, emptyReviews } from '../test/fixtures'

beforeEach(() => {
  vi.spyOn(moviesApi, 'get').mockResolvedValue(movie)
  vi.spyOn(moviesApi, 'reviews').mockResolvedValue(emptyReviews)
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function showDetails() {
  const callbacks = { onClose: vi.fn(), onUpdated: vi.fn(), onDeleted: vi.fn(),
    onReviewChanged: vi.fn(), onCollectionChanged: vi.fn(), onReportProblem: vi.fn() }
  render(<MovieDetails id={movie.sk_movie_id} user={admin} {...callbacks} />)
  return callbacks
}

it('publica resenha, atualiza média e impede uma segunda avaliação', async () => {
  const add = vi.spyOn(moviesApi, 'addReview').mockImplementation(async () => {
    vi.mocked(moviesApi.reviews).mockResolvedValue({ ...emptyReviews,
      items: [{ ...review, nota: 4.5 }], total: 1, total_pages: 1,
      media_avaliacoes: 4.5, my_review_id: review.sk_movie_review_id })
    return { ...review, nota: 4.5 }
  })
  const callbacks = showDetails()
  await screen.findByText('Nova avaliação')
  await userEvent.type(screen.getByLabelText('Comentário'), 'Ótimo filme.')
  await userEvent.click(screen.getByRole('button', { name: '4,5 estrelas' }))
  await userEvent.click(screen.getByRole('button', { name: 'Publicar avaliação' }))
  await screen.findByText('Sua avaliação')
  expect(add).toHaveBeenCalledWith(movie.sk_movie_id, {
    nome: admin.display_name, nota: 4.5, comentario: 'Ótimo filme.',
  })
  expect(callbacks.onReviewChanged).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Publicar avaliação' })).not.toBeInTheDocument()
  expect(localStorage.length).toBe(0)
})

it('edita e exclui a própria avaliação com confirmação e nova média', async () => {
  vi.mocked(moviesApi.reviews).mockResolvedValue({ ...emptyReviews, items: [review], total: 1,
    total_pages: 1, media_avaliacoes: 4, my_review_id: review.sk_movie_review_id })
  const update = vi.spyOn(moviesApi, 'updateReview').mockImplementation(async () => {
    const updated = { ...review, nota: 2.5 }
    vi.mocked(moviesApi.reviews).mockResolvedValue({ ...emptyReviews, items: [updated],
      total: 1, total_pages: 1, media_avaliacoes: 2.5, my_review_id: review.sk_movie_review_id })
    return updated
  })
  const remove = vi.spyOn(moviesApi, 'removeReview').mockImplementation(async () => {
    vi.mocked(moviesApi.reviews).mockResolvedValue(emptyReviews)
  })
  const callbacks = showDetails()
  await userEvent.click(await screen.findByRole('button', { name: 'Editar avaliação' }))
  await userEvent.click(screen.getByRole('button', { name: '2,5 estrelas' }))
  await userEvent.click(screen.getByRole('button', { name: 'Salvar avaliação' }))
  await screen.findByText('Avaliação atualizada com sucesso.')
  expect(update).toHaveBeenCalledWith(movie.sk_movie_id, review.sk_movie_review_id, { nota: 2.5 })
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir avaliação' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByText('Nova avaliação')
  expect(callbacks.onReviewChanged).toHaveBeenCalledTimes(2)
})

it('pagina o histórico preservando a média geral', async () => {
  vi.mocked(moviesApi.reviews).mockImplementation(async (_id, page) => ({
    ...emptyReviews, items: [{ ...review, nome: page === 2 ? 'Segunda página' : 'Primeira página' }],
    page: page ?? 1, total: 11, total_pages: 2, media_avaliacoes: 3,
    my_review_id: review.sk_movie_review_id,
  }))
  showDetails()
  await screen.findByText('Primeira página')
  const pagination = screen.getByRole('navigation', { name: 'Paginação das avaliações' })
  await userEvent.click(within(pagination).getByRole('button', { name: 'Próxima' }))
  await screen.findByText('Segunda página')
  expect(moviesApi.reviews).toHaveBeenLastCalledWith(movie.sk_movie_id, 2, 10, expect.any(AbortSignal))
  expect(screen.getByLabelText('Nota 3 de 5 estrelas')).toBeInTheDocument()
})

it('mantém o rascunho e apresenta falha ao publicar', async () => {
  vi.spyOn(moviesApi, 'addReview').mockRejectedValue(new Error('Falha ao publicar.'))
  showDetails()
  await screen.findByText('Nova avaliação')
  await userEvent.type(screen.getByLabelText('Comentário'), 'Meu comentário')
  await userEvent.click(screen.getByRole('button', { name: '1 estrela' }))
  await userEvent.click(screen.getByRole('button', { name: 'Publicar avaliação' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao publicar.')
  expect(screen.getByLabelText('Comentário')).toHaveValue('Meu comentário')
  expect(localStorage.length).toBe(1)
})

it('informa filme inexistente e permite fechar os detalhes', async () => {
  vi.mocked(moviesApi.get).mockRejectedValue(new ApiError('Filme não encontrado.', 404))
  const callbacks = showDetails()
  expect(await screen.findByRole('alert')).toHaveTextContent('Filme não encontrado.')
  await userEvent.click(screen.getByRole('button', { name: 'Voltar ao catálogo' }))
  expect(callbacks.onClose).toHaveBeenCalledOnce()
})

it('invalida o catálogo após salvar mesmo com a releitura das avaliações pendente', async () => {
  vi.spyOn(moviesApi, 'addReview').mockImplementation(async () => {
    vi.mocked(moviesApi.reviews).mockImplementation(() => new Promise(() => {}))
    return review
  })
  const callbacks = showDetails()
  await screen.findByText('Nova avaliação')
  await userEvent.type(screen.getByLabelText('Comentário'), 'Ótimo filme.')
  await userEvent.click(screen.getByRole('button', { name: '4 estrelas' }))
  await userEvent.click(screen.getByRole('button', { name: 'Publicar avaliação' }))
  expect(callbacks.onReviewChanged).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }))
  expect(callbacks.onClose).toHaveBeenCalledOnce()
})
