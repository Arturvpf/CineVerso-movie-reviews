import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { moviesApi } from '../services/movies'
import type { Movie } from '../types/movie'
import { CollectionButtons } from './CollectionButtons'

const movie: Movie = {
  sk_movie_id: 'movie-1', id_filme: 'external-1', titulo: 'Um filme',
  data_lancamento: null, ano_lancamento: 2020, duracao_minutos: null,
  status_filme: null, sinopse: null, url_poster: null, url_backdrop: null,
  generos: [], diretores: [], total_avaliacoes: 0, media_avaliacoes: null,
  is_favorite: false, in_watchlist: false,
}

afterEach(() => vi.restoreAllMocks())

function CollectionsHost() {
  const [current, setCurrent] = useState(movie)
  return <CollectionButtons movie={current} onChanged={setCurrent} />
}

it('adiciona e remove um filme da Watchlist', async () => {
  const add = vi.spyOn(moviesApi, 'addToCollection').mockResolvedValue({
    ...movie, in_watchlist: true,
  })
  const remove = vi.spyOn(moviesApi, 'removeFromCollection').mockResolvedValue()
  const interaction = userEvent.setup()
  render(<CollectionsHost />)

  await interaction.click(screen.getByRole('button', { name: 'Adicionar a Watchlist: Um filme' }))
  expect(add).toHaveBeenCalledWith('movie-1', 'watchlist')
  const removeButton = await screen.findByRole('button', { name: 'Remover de Watchlist: Um filme' })
  expect(removeButton).toHaveAttribute('aria-pressed', 'true')

  await interaction.click(removeButton)
  expect(remove).toHaveBeenCalledWith('movie-1', 'watchlist')
  expect(await screen.findByRole('button', { name: 'Adicionar a Watchlist: Um filme' }))
    .toHaveAttribute('aria-pressed', 'false')
})

it('mostra o erro sem marcar o filme como favorito', async () => {
  vi.spyOn(moviesApi, 'addToCollection').mockRejectedValue(new Error('Serviço indisponível.'))
  const interaction = userEvent.setup()
  render(<CollectionsHost />)

  await interaction.click(screen.getByRole('button', { name: 'Adicionar a Favoritos: Um filme' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível.')
  expect(screen.getByRole('button', { name: 'Adicionar a Favoritos: Um filme' }))
    .toHaveAttribute('aria-pressed', 'false')
})
