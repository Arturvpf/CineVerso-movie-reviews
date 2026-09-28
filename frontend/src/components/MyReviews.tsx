import { useCallback, useEffect, useState } from 'react'
import type { User } from '../services/auth'
import { draftKey, removeDraft } from '../services/drafts'
import { pathForMovie } from '../services/movieUrl'
import { moviesApi } from '../services/movies'
import type { MyReviewPage } from '../types/movie'
import { MovieDetails, ReviewEditForm } from './MovieDetails'
import { StarRatingDisplay } from './StarRatingInput'

function reviewDate(value: string) {
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? 'Data não disponível' : date.toLocaleDateString('pt-BR')
}

export function MyReviews({
  user, selectedMovieId, onOpenMovie, onCloseMovie, onReportProblem,
}: {
  user: User
  selectedMovieId: string | null
  onOpenMovie: (movieId: string) => void
  onCloseMovie: (replace?: boolean) => void
  onReportProblem: (movieId: string) => void
}) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<MyReviewPage>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const reload = useCallback(() => setRefresh((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    moviesApi.mine(page, controller.signal).then((result) => {
      if (page > Math.max(1, result.total_pages)) {
        setPage(Math.max(1, result.total_pages))
        return
      }
      setData(result)
      setError('')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas avaliações.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [page, refresh])

  async function removeReview(movieId: string, reviewId: string) {
    setBusy(true)
    setActionError('')
    try {
      await moviesApi.removeReview(movieId, reviewId)
      removeDraft(draftKey(user.id, 'edit-review', reviewId))
      setConfirming(null)
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir a avaliação.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="catalog" aria-labelledby="my-reviews-title">
    <div className="catalog-heading"><div>
      <p className="eyebrow">SEU HISTÓRICO</p>
      <h2 id="my-reviews-title">Minhas reviews</h2>
    </div></div>
    <p className="quality-intro">Reveja, edite ou exclua as avaliações feitas pela sua conta.</p>
    {loading ? <p role="status">Carregando suas avaliações…</p>
      : error ? <div className="empty-state" role="alert"><p>{error}</p><button onClick={reload}>Tentar novamente</button></div>
      : !data?.items.length ? <div className="empty-state"><h3>Nenhuma review ainda</h3>
        <p>Abra um filme no catálogo e publique sua primeira avaliação.</p></div>
      : <>
        <p className="review-count">{data.total.toLocaleString('pt-BR')} avaliações suas</p>
        <div className="my-reviews-list">{data.items.map((review) => <article className="my-review-card" key={review.sk_movie_review_id}>
          <div className="my-review-poster">{review.movie_poster
            ? <img src={review.movie_poster} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />
            : <span aria-hidden="true">R.</span>}</div>
          <div className="my-review-body">
            <div className="my-review-heading"><div>
              <p className="eyebrow">{reviewDate(review.created_at)}</p>
              <h3>{review.movie_title}</h3>
            </div><StarRatingDisplay value={review.nota} /></div>
            <p className="preserve-text">{review.comentario}</p>
            {editing === review.sk_movie_review_id ? <ReviewEditForm
              movieId={review.sk_movie_id} review={review} userId={user.id}
              onBusy={setBusy} onCancel={() => setEditing(null)}
              onSaved={() => { setEditing(null); reload() }} />
              : confirming === review.sk_movie_review_id ? <div className="review-confirmation">
                <p>Excluir esta avaliação permanentemente?</p>
                {actionError && <p className="form-error" role="alert">{actionError}</p>}
                <div className="detail-actions"><button className="danger" disabled={busy}
                  onClick={() => removeReview(review.sk_movie_id, review.sk_movie_review_id)}>
                  {busy ? 'Excluindo…' : 'Confirmar exclusão'}</button>
                  <button className="secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button></div>
              </div> : <div className="review-actions">
                <a className="secondary review-movie-link" href={pathForMovie(review.sk_movie_id)}
                  onClick={(event) => {
                    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    event.preventDefault()
                    onOpenMovie(review.sk_movie_id)
                  }}>Ver filme</a>
                <button className="secondary" disabled={busy} onClick={() => {
                  setConfirming(null); setEditing(review.sk_movie_review_id)
                }}>Editar review</button>
                <button className="secondary danger" disabled={busy} onClick={() => {
                  setEditing(null); setActionError(''); setConfirming(review.sk_movie_review_id)
                }}>Excluir review</button>
              </div>}
          </div>
        </article>)}</div>
        {data.total_pages > 1 && <nav className="pagination" aria-label="Páginas das suas reviews">
          <button className="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setLoading(true) }}>Anterior</button>
          <span>Página {page} de {data.total_pages}</span>
          <button className="secondary" disabled={page >= data.total_pages} onClick={() => { setPage(page + 1); setLoading(true) }}>Próxima</button>
        </nav>}
      </>}
    {selectedMovieId && <MovieDetails key={selectedMovieId} id={selectedMovieId} user={user}
      onClose={() => onCloseMovie()} onUpdated={reload}
      onReportProblem={onReportProblem}
      onDeleted={() => { onCloseMovie(true); reload() }}
      onCollectionChanged={() => {}} onReviewed={reload} />}
  </section>
}
