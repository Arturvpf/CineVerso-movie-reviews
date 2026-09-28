import { useState } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie, MovieCollection } from '../types/movie'

const options: { key: MovieCollection; field: 'is_favorite' | 'in_watchlist'; label: string }[] = [
  { key: 'favorites', field: 'is_favorite', label: 'Favoritos' },
  { key: 'watchlist', field: 'in_watchlist', label: 'Watchlist' },
]

export function CollectionButtons({ movie, onChanged, disabled = false }: {
  movie: Movie
  onChanged: (updated: Movie) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState<MovieCollection | null>(null)
  const [error, setError] = useState('')

  async function toggle(collection: MovieCollection, field: 'is_favorite' | 'in_watchlist') {
    if (busy || disabled) return
    setBusy(collection)
    setError('')
    try {
      if (movie[field]) {
        await moviesApi.removeFromCollection(movie.sk_movie_id, collection)
        onChanged({ ...movie, [field]: false })
      } else {
        onChanged(await moviesApi.addToCollection(movie.sk_movie_id, collection))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a lista.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="collection-controls">
      <div className="collection-buttons">
        {options.map(({ key, field, label }) => (
          <button
            key={key}
            type="button"
            className={`secondary collection-button ${movie[field] ? 'selected' : ''}`}
            aria-pressed={movie[field]}
            aria-label={`${movie[field] ? 'Remover de' : 'Adicionar a'} ${label}: ${movie.titulo}`}
            disabled={busy !== null || disabled}
            onClick={() => toggle(key, field)}
          >
            <span aria-hidden="true">{key === 'favorites' ? '♥' : '◷'}</span> {label}
          </button>
        ))}
      </div>
      {error && <p className="form-error collection-error" role="alert">{error}</p>}
    </div>
  )
}
