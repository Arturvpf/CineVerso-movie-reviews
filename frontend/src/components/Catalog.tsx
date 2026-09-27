import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie, MoviePage } from '../types/movie'
import { MovieEditor } from './MovieEditor'

function MovieCard({ movie, onEdit }: { movie: Movie; onEdit: () => void }) {
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
        <button
          className="secondary"
          onClick={onEdit}
          aria-label={`Editar ${movie.titulo}`}
        >
          Editar filme <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  )
}

export function Catalog() {
  const [query, setQuery] = useState({ q: '', page: 1, page_size: 12 })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<MoviePage>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    moviesApi
      .list(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.total_pages > 0 && query.page > result.total_pages) {
          setQuery((previous) => ({ ...previous, page: result.total_pages }))
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
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <div>
          <label htmlFor="search">Pesquisar por título</label>
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
        {query.q && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSearch('')
              updateQuery({ ...query, q: '', page: 1 })
            }}
          >
            Limpar busca
          </button>
        )}
      </form>
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
                  onEdit={() => {
                    setNotice('')
                    setEditor(movie.sk_movie_id)
                  }}
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
              {query.q
                ? 'Nenhum filme encontrado'
                : 'Sua biblioteca está começando'}
            </h3>
            <p>
              {query.q
                ? 'Tente outro título ou limpe a busca.'
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
    </section>
  )
}
