import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie, MovieCollection, MoviePage } from '../types/movie'
import { CollectionButtons } from './CollectionButtons'
import { MovieEditor } from './MovieEditor'
import { MovieDetails } from './MovieDetails'

function MovieCard({
  movie,
  onEdit,
  onDetails,
  onCollectionChanged,
}: {
  movie: Movie
  onEdit: () => void
  onDetails: () => void
  onCollectionChanged: (movie: Movie) => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <article className="movie-card">
      <div className="poster">
        {movie.url_poster && !imageFailed ? (
          <img
            src={movie.url_poster}
            alt={`Pôster de ${movie.titulo}`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="poster-placeholder">
            <span aria-hidden="true">R.</span>
            <span>Sem pôster</span>
          </div>
        )}
        <span className="rating">
          {movie.media_avaliacoes === null
            ? 'Sem notas'
            : `★ ${movie.media_avaliacoes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`}
        </span>
      </div>
      <div className="card-content">
        <p className="movie-year">
          {movie.ano_lancamento ?? 'Ano não informado'} ·{' '}
          {movie.generos.join(', ') || 'Gênero não informado'}
        </p>
        <h3>{movie.titulo}</h3>
        <p className="movie-director">
          {movie.diretores.join(', ') || 'Direção não informada'}
        </p>
        <div className="card-actions">
          <button
            onClick={onDetails}
            aria-label={`Ver detalhes de ${movie.titulo}`}
          >
            Ver detalhes
          </button>
          <button
            className="secondary"
            onClick={onEdit}
            aria-label={`Editar ${movie.titulo}`}
          >
            Editar filme <span aria-hidden="true">↗</span>
          </button>
        </div>
        <CollectionButtons movie={movie} onChanged={onCollectionChanged} />
      </div>
    </article>
  )
}

export function Catalog({ initialMovieId = null }: { initialMovieId?: string | null }) {
  const [query, setQuery] = useState<{
    q: string
    page: number
    page_size: number
    collection?: MovieCollection
    genre?: string
    min_rating?: number
  }>({ q: '', page: 1, page_size: 12 })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<MoviePage>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState<string | null>(null)
  const [details, setDetails] = useState<string | null>(initialMovieId)
  const [notice, setNotice] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [genreError, setGenreError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    moviesApi.genres(controller.signal)
      .then((items) => setGenres(items))
      .catch(() => {
        if (!controller.signal.aborted) setGenreError(true)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    moviesApi
      .list(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (query.page > Math.max(1, result.total_pages)) {
          setQuery((previous) => ({
            ...previous,
            page: Math.max(1, result.total_pages),
          }))
          return
        }
        setData(result)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar o catálogo.',
        )
        setLoading(false)
      })
    return () => controller.abort()
  }, [query, refresh])

  function reload() {
    setError('')
    setLoading(true)
    setRefresh((value) => value + 1)
  }
  function updateQuery(next: typeof query) {
    setError('')
    setLoading(true)
    setQuery(next)
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    updateQuery({ ...query, q: search.trim(), page: 1 })
  }
  function saved(movie: Movie) {
    setNotice(
      `“${movie.titulo}” ${editor === 'new' ? 'cadastrado' : 'atualizado'} com sucesso.`,
    )
    setEditor(null)
    reload()
  }

  function collectionChanged(movie: Movie) {
    setData((previous) => previous && {
      ...previous,
      items: previous.items.map((item) => item.sk_movie_id === movie.sk_movie_id ? movie : item),
    })
    if (query.collection) reload()
  }

  function selectCollection(collection?: MovieCollection) {
    if (query.collection === collection) return
    setSearch('')
    updateQuery({ ...query, collection, q: '', genre: undefined, min_rating: undefined, page: 1 })
  }

  const reviewed = useCallback((movieId: string, total: number, average: number | null) => {
    setData((previous) => previous && {
      ...previous,
      items: previous.items.map((movie) =>
        movie.sk_movie_id === movieId
          ? { ...movie, total_avaliacoes: total, media_avaliacoes: average }
          : movie,
      ),
    })
  }, [])

  return (
    <section className="catalog" aria-labelledby="catalog-title">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">SUA BIBLIOTECA</p>
          <h2 id="catalog-title">Catálogo de filmes</h2>
        </div>
        <button
          onClick={() => {
            setNotice('')
            setEditor('new')
          }}
        >
          + Cadastrar filme
        </button>
      </div>
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      <nav className="collection-tabs" aria-label="Listas de filmes">
        {([
          [undefined, 'Filmes'],
          ['favorites', 'Favoritos'],
          ['watchlist', 'Watchlist'],
        ] as const).map(([collection, label]) => (
          <button
            key={label}
            type="button"
            className={query.collection === collection ? 'active' : ''}
            aria-current={query.collection === collection ? 'page' : undefined}
            onClick={() => selectCollection(collection)}
          >
            {label}
          </button>
        ))}
      </nav>
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <div>
          <label htmlFor="search">Pesquisar por título ou diretor</label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={500}
            placeholder="Qual filme você está procurando?"
          />
        </div>
        <button type="submit">Pesquisar</button>
        {(query.q || query.genre || query.min_rating !== undefined) && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSearch('')
              updateQuery({ ...query, q: '', genre: undefined, min_rating: undefined, page: 1 })
            }}
          >
            Limpar filtros
          </button>
        )}
      </form>
      <div className="catalog-filters" aria-label="Filtros do catálogo">
        <label htmlFor="genre-filter">
          Gênero
          <select
            id="genre-filter"
            value={query.genre ?? ''}
            onChange={(event) => updateQuery({
              ...query, q: search.trim(), genre: event.target.value || undefined, page: 1,
            })}
          >
            <option value="">Todos os gêneros</option>
            {genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
          </select>
        </label>
        <label htmlFor="rating-filter">
          Nota mínima
          <select
            id="rating-filter"
            value={query.min_rating ?? ''}
            onChange={(event) => updateQuery({
              ...query,
              q: search.trim(),
              min_rating: event.target.value ? Number(event.target.value) : undefined,
              page: 1,
            })}
          >
            <option value="">Qualquer nota</option>
            {[1, 2, 3, 4, 4.5, 5].map((rating) => (
              <option key={rating} value={rating}>{rating}+ estrelas</option>
            ))}
          </select>
        </label>
        {genreError && <p className="form-error" role="alert">Não foi possível carregar os gêneros.</p>}
      </div>
      <div className="catalog-meta">
        <p role="status">
          {loading
            ? 'Carregando filmes…'
            : error
              ? 'Catálogo indisponível'
              : `${(data?.total ?? 0).toLocaleString('pt-BR')} filmes encontrados`}
        </p>
        <label>
          Por página{' '}
          <select
            value={query.page_size}
            onChange={(event) =>
              updateQuery({
                ...query,
                page_size: Number(event.target.value),
                page: 1,
              })
            }
          >
            {[12, 24, 48].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="empty-state" role="alert">
          <h3>Não conseguimos carregar os filmes.</h3>
          <p>{error}</p>
          <button onClick={reload}>Tentar novamente</button>
        </div>
      )}
      {!error && loading && (
        <div className="loading-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} />
          ))}
        </div>
      )}
      {!error &&
        !loading &&
        data &&
        (data.items.length ? (
          <>
            <div className="movie-grid">
              {data.items.map((movie) => (
                <MovieCard
                  key={`${movie.sk_movie_id}:${movie.url_poster}`}
                  movie={movie}
                  onDetails={() => {
                    setNotice('')
                    setDetails(movie.sk_movie_id)
                  }}
                  onEdit={() => {
                    setNotice('')
                    setEditor(movie.sk_movie_id)
                  }}
                  onCollectionChanged={collectionChanged}
                />
              ))}
            </div>
            <nav className="pagination" aria-label="Paginação do catálogo">
              <button
                className="secondary"
                disabled={data.page <= 1}
                onClick={() => updateQuery({ ...query, page: query.page - 1 })}
              >
                Anterior
              </button>
              <span>
                Página {data.page} de {data.total_pages.toLocaleString('pt-BR')}
              </span>
              <button
                className="secondary"
                disabled={data.page >= data.total_pages}
                onClick={() => updateQuery({ ...query, page: query.page + 1 })}
              >
                Próxima
              </button>
            </nav>
          </>
        ) : (
          <div className="empty-state">
            <h3>
              {query.q || query.genre || query.min_rating !== undefined
                ? 'Nenhum filme encontrado'
                : query.collection === 'favorites'
                  ? 'Nenhum favorito ainda'
                  : query.collection === 'watchlist'
                    ? 'Sua Watchlist está vazia'
                    : 'Sua biblioteca está começando'}
            </h3>
            <p>
              {query.q
                ? 'Tente outro título ou diretor, ou limpe os filtros.'
                : query.genre || query.min_rating !== undefined
                  ? 'Altere os filtros ou limpe a busca.'
                  : query.collection
                  ? 'Adicione filmes pelo catálogo ou pelos detalhes.'
                  : 'Cadastre o primeiro filme para começar.'}
            </p>
          </div>
        ))}
      {editor && (
        <MovieEditor
          key={editor}
          id={editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {details && (
        <MovieDetails
          key={details}
          id={details}
          onClose={() => setDetails(null)}
          onUpdated={() => reload()}
          onCollectionChanged={collectionChanged}
          onReviewed={reviewed}
          onDeleted={(movie) => {
            setDetails(null)
            setNotice(`“${movie.titulo}” excluído com sucesso.`)
            reload()
          }}
        />
      )}
    </section>
  )
}
