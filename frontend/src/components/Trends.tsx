import { useCallback, useEffect, useState } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie, MoviePage } from '../types/movie'
import type { User } from '../services/auth'
import { pathForMovie } from '../services/movieUrl'
import { CollectionButtons } from './CollectionButtons'
import { MovieDetails } from './MovieDetails'

type Sort = 'popular' | 'most_reviewed' | 'top_rated'
const choices: { value: Sort; label: string; explanation: string }[] = [
  { value: 'popular', label: 'Mais populares', explanation: 'Popularidade registrada no catálogo.' },
  { value: 'most_reviewed', label: 'Mais avaliados', explanation: 'Filmes com mais avaliações da comunidade.' },
  { value: 'top_rated', label: 'Melhores notas', explanation: 'Maior média entre filmes com pelo menos cinco avaliações.' },
]

export function Trends({ user, selectedMovieId, onOpenMovie, onCloseMovie, onReportProblem }: {
  user: User
  selectedMovieId: string | null
  onOpenMovie: (movieId: string) => void
  onCloseMovie: (replace?: boolean) => void
  onReportProblem: (movieId: string) => void
}) {
  const [sort, setSort] = useState<Sort>('popular')
  const [data, setData] = useState<MoviePage>()
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(() => setRefresh((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    moviesApi.trending(sort, controller.signal).then((result) => {
      setData(result)
      setError('')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as tendências.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [sort, refresh])

  function updateMovie(movie: Movie) {
    setData((previous) => previous && ({ ...previous,
      items: previous.items.map((item) => item.sk_movie_id === movie.sk_movie_id ? movie : item),
    }))
  }

  return <section className="catalog" aria-labelledby="trends-title">
    <div className="catalog-heading"><div>
      <p className="eyebrow">DESCUBRA FILMES</p>
      <h2 id="trends-title">Tendências</h2>
    </div></div>
    <nav className="collection-tabs" aria-label="Critério das tendências">
      {choices.map((choice) => <button type="button" key={choice.value}
        className={sort === choice.value ? 'active' : ''} aria-current={sort === choice.value ? 'page' : undefined}
        onClick={() => { setSort(choice.value); setLoading(true) }}>{choice.label}</button>)}
    </nav>
    <p className="quality-intro">{choices.find((choice) => choice.value === sort)?.explanation} Ranking baseado nos dados disponíveis, sem atualização em tempo real.</p>
    {loading ? <p role="status">Carregando tendências…</p>
      : error ? <div className="empty-state" role="alert"><p>{error}</p><button onClick={reload}>Tentar novamente</button></div>
      : data?.items.length ? <div className="movie-grid">{data.items.map((movie, index) => <article className="movie-card" key={movie.sk_movie_id}>
        <div className="poster">{movie.url_poster ? <img src={movie.url_poster} alt={`Pôster de ${movie.titulo}`} loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true }} /> : <div className="poster-placeholder">Sem pôster</div>}
          <span className="rating">#{index + 1}</span></div>
        <div className="card-content"><p className="movie-year">{movie.ano_lancamento ?? 'Ano não informado'} · {movie.generos.join(', ') || 'Gênero não informado'}</p>
          <h3>{movie.titulo}</h3><p className="movie-director">{movie.total_avaliacoes} avaliações · {movie.media_avaliacoes === null ? 'Sem notas' : `${movie.media_avaliacoes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ★`}</p>
          <a className="movie-link" href={pathForMovie(movie.sk_movie_id)}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              onOpenMovie(movie.sk_movie_id)
            }}>Ver detalhes</a>
          <CollectionButtons movie={movie} onChanged={updateMovie} />
        </div>
      </article>)}</div> : <div className="empty-state"><p>Ainda não há dados para este ranking.</p></div>}
    {selectedMovieId && <MovieDetails key={selectedMovieId} id={selectedMovieId}
      user={user} onClose={() => onCloseMovie()}
      onReportProblem={onReportProblem}
      onUpdated={updateMovie} onDeleted={() => { onCloseMovie(true); reload() }}
      onCollectionChanged={updateMovie} onReviewed={reload} />}
  </section>
}
