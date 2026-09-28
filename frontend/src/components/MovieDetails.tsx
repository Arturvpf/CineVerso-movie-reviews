import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/http'
import { moviesApi } from '../services/movies'
import type { Movie, Review, ReviewList, ReviewUpdate } from '../types/movie'
import type { User } from '../services/auth'
import { MovieForm } from './MovieForm'
import { CollectionButtons } from './CollectionButtons'
import { StarRatingDisplay, StarRatingInput } from './StarRatingInput'

function Poster({ movie }: { movie: Movie }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="detail-poster poster">
      {movie.url_poster && !failed ? (
        <img
          src={movie.url_poster}
          alt={`Pôster de ${movie.titulo}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="poster-placeholder">
          <span aria-hidden="true">R.</span>
          <span>Sem pôster</span>
        </div>
      )}
    </div>
  )
}

function reviewDate(value: string) {
  const date = new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`,
  )
  return Number.isNaN(date.getTime())
    ? 'Data não disponível'
    : date.toLocaleString('pt-BR')
}

function ReviewForm({
  movieId,
  user,
  disabled,
  onBusy,
  onCreated,
}: {
  movieId: string
  user: User
  disabled: boolean
  onBusy: (busy: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState(user.display_name)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled) return
    const nome = name.trim()
    const comentario = comment.trim()
    const nota = rating
    if (
      !nome || !comentario || !rating ||
      !Number.isFinite(nota) || nota < 1 || nota > 5
    ) {
      setError('Informe nome, nota entre 1 e 5 e comentário.')
      return
    }
    setError('')
    setSuccess(false)
    setBusy(true)
    onBusy(true)
    try {
      await moviesApi.addReview(movieId, { nome, nota, comentario })
      onCreated()
      setName(user.display_name)
      setRating(0)
      setComment('')
      setSuccess(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar a avaliação.',
      )
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <section className="detail-section" aria-labelledby="review-form-title">
      <h3 id="review-form-title">Nova avaliação</h3>
      <form onSubmit={submit}>
        {success && (
          <p className="success-notice" role="status">Avaliação cadastrada com sucesso.</p>
        )}
        {error && (
          <p className="form-error" role="alert">{error}</p>
        )}
        <fieldset className="form-grid" disabled={busy || disabled}>
          <div>
            <label htmlFor="review-name">Nome</label>
            <input
              id="review-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div>
            <span className="field-label">Nota (1 a 5 estrelas, de meia em meia)</span>
            <StarRatingInput value={rating} onChange={setRating} disabled={busy || disabled} />
          </div>
          <div className="full">
            <label htmlFor="review-comment">Comentário</label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={4000}
              rows={4}
              required
            />
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="submit" disabled={busy || disabled}>
            {busy ? 'Salvando avaliação…' : 'Publicar avaliação'}
          </button>
        </div>
      </form>
    </section>
  )
}

function ReviewEditForm({ movieId, review, onBusy, onSaved, onCancel }: {
  movieId: string
  review: Review
  onBusy: (busy: boolean) => void
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(review.nome)
  const [rating, setRating] = useState(review.nota)
  const [comment, setComment] = useState(review.comentario)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const nome = name.trim()
    const comentario = comment.trim()
    if (!nome || !comentario || (rating !== review.nota && (rating < 1 || rating > 5))) {
      setError('Informe nome, comentário e nota entre 1 e 5 estrelas.')
      return
    }
    const changes: ReviewUpdate = {}
    if (nome !== review.nome) changes.nome = nome
    if (comentario !== review.comentario) changes.comentario = comentario
    if (rating !== review.nota) changes.nota = rating
    if (!Object.keys(changes).length) {
      onCancel()
      return
    }
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      await moviesApi.updateReview(movieId, review.sk_movie_review_id, changes)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível editar a avaliação.')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <form className="review-edit-form" onSubmit={submit}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <fieldset className="form-grid" disabled={busy}>
        <div>
          <label htmlFor={`review-edit-name-${review.sk_movie_review_id}`}>Nome</label>
          <input
            id={`review-edit-name-${review.sk_movie_review_id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div>
          <span className="field-label">Nota</span>
          <StarRatingInput value={rating} onChange={setRating} disabled={busy} />
        </div>
        <div className="full">
          <label htmlFor={`review-edit-comment-${review.sk_movie_review_id}`}>Comentário</label>
          <textarea
            id={`review-edit-comment-${review.sk_movie_review_id}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={4000}
            rows={3}
            required
          />
        </div>
      </fieldset>
      <div className="detail-actions">
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function MovieDetails({
  id,
  user,
  onClose,
  onUpdated,
  onDeleted,
  onReviewed,
  onCollectionChanged,
}: {
  id: string
  user: User
  onClose: () => void
  onUpdated: (movie: Movie) => void
  onDeleted: (movie: Movie) => void
  onReviewed: (movieId: string, total: number, average: number | null) => void
  onCollectionChanged: (movie: Movie) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelDelete = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const [data, setData] = useState<{ movie: Movie; reviews: ReviewList }>()
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewRefresh, setReviewRefresh] = useState(0)
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [editingReview, setEditingReview] = useState<string | null>(null)
  const [confirmingReview, setConfirmingReview] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      moviesApi.get(id, controller.signal),
      moviesApi.reviews(id, reviewPage, 10, controller.signal),
    ])
      .then(([movie, reviews]) => {
        if (controller.signal.aborted) return
        if (reviewPage > Math.max(1, reviews.total_pages)) {
          setReviewPage(Math.max(1, reviews.total_pages))
          return
        }
        setData({ movie, reviews })
        setReviewsLoading(false)
        if (reviewRefresh > 0) {
          onReviewed(id, reviews.total, reviews.media_avaliacoes)
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setMissing(cause instanceof ApiError && cause.status === 404)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os detalhes.',
        )
        setReviewsLoading(false)
      })
    return () => controller.abort()
  }, [id, attempt, reviewPage, reviewRefresh, onReviewed])

  useEffect(() => {
    if (confirming) cancelDelete.current?.focus()
  }, [confirming])

  function cancelConfirmation() {
    setConfirming(false)
    setDeleteError('')
    requestAnimationFrame(() => deleteButton.current?.focus())
  }

  async function remove() {
    if (!data || busy) return
    setBusy(true)
    setDeleteError('')
    try {
      await moviesApi.remove(id)
      onDeleted(data.movie)
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível excluir o filme.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeReview(reviewId: string) {
    if (busy) return
    setBusy(true)
    setReviewError('')
    try {
      await moviesApi.removeReview(id, reviewId)
      setConfirmingReview(null)
      setReviewsLoading(true)
      setReviewRefresh((value) => value + 1)
      setNotice('Avaliação excluída com sucesso.')
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : 'Não foi possível excluir a avaliação.')
    } finally {
      setBusy(false)
    }
  }

  const movie = data?.movie
  return (
    <dialog
      ref={dialog}
      className="movie-dialog details-dialog"
      aria-labelledby="details-title"
      onCancel={(event) => {
        event.preventDefault()
        if (busy) return
        if (confirming) cancelConfirmation()
        else if (editing) setEditing(false)
        else if (confirmingReview) setConfirmingReview(null)
        else if (editingReview) setEditingReview(null)
        else onClose()
      }}
    >
      <div className="dialog-header">
        <h2 id="details-title">
          {editing
            ? 'Editar filme'
            : missing
              ? 'Filme não encontrado'
              : 'Detalhes do filme'}
        </h2>
        <button
          className="secondary"
          aria-label="Fechar detalhes"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          {!missing && (
            <button
              onClick={() => {
                setError('')
                setReviewsLoading(true)
                setAttempt((value) => value + 1)
              }}
            >
              Tentar novamente
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Voltar ao catálogo
          </button>
        </div>
      ) : !data || !movie ? (
        <p role="status">Carregando detalhes e avaliações…</p>
      ) : editing ? (
        <MovieForm
          movie={movie}
          onBusy={setBusy}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setData({ ...data, movie: updated })
            setEditing(false)
            setNotice('Filme atualizado com sucesso.')
            onUpdated(updated)
          }}
        />
      ) : (
        <>
          {notice && (
            <p className="success-notice" role="status">
              {notice}
            </p>
          )}
          <div className="detail-summary">
            <Poster key={movie.url_poster} movie={movie} />
            <div className="detail-info">
              <p className="eyebrow">
                {movie.ano_lancamento ?? 'Ano não informado'}
              </p>
              <h3>{movie.titulo}</h3>
              <p>{movie.generos.join(' · ') || 'Gênero não informado'}</p>
              <dl>
                <dt>Direção</dt>
                <dd>{movie.diretores.join(', ') || 'Não informada'}</dd>
                <dt>Lançamento</dt>
                <dd>
                  {movie.data_lancamento?.split('-').reverse().join('/') ||
                    'Não informado'}
                </dd>
                <dt>Duração</dt>
                <dd>
                  {movie.duracao_minutos
                    ? `${movie.duracao_minutos} min`
                    : 'Não informada'}
                </dd>
                <dt>Status</dt>
                <dd>{movie.status_filme || 'Não informado'}</dd>
              </dl>
              <p className="detail-rating">
                {data.reviews.media_avaliacoes === null
                  ? 'Sem avaliações'
                  : <StarRatingDisplay value={data.reviews.media_avaliacoes} />}
              </p>
              <CollectionButtons
                movie={movie}
                disabled={confirming || busy}
                onChanged={(updated) => {
                  setData({ ...data, movie: updated })
                  onCollectionChanged(updated)
                }}
              />
              {user.role === 'admin' && <div className="detail-actions">
                <button
                  disabled={confirming || busy}
                  onClick={() => {
                    setNotice('')
                    setEditing(true)
                  }}
                >
                  Editar filme
                </button>
                <button
                  ref={deleteButton}
                  className="danger secondary"
                  disabled={confirming || busy}
                  onClick={() => {
                    setNotice('')
                    setConfirming(true)
                  }}
                >
                  Excluir filme
                </button>
              </div>}
            </div>
          </div>
          {confirming && (
            <section
              className="delete-confirmation"
              aria-labelledby="confirm-title"
            >
              <h3 id="confirm-title">Excluir “{movie.titulo}”?</h3>
              <p>O filme e suas avaliações serão removidos permanentemente.</p>
              {deleteError && (
                <p className="form-error" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="detail-actions">
                <button
                  ref={cancelDelete}
                  className="secondary"
                  disabled={busy}
                  onClick={cancelConfirmation}
                >
                  Cancelar exclusão
                </button>
                <button className="danger" disabled={busy} onClick={remove}>
                  {busy ? 'Excluindo…' : 'Confirmar exclusão'}
                </button>
              </div>
            </section>
          )}
          <section className="detail-section">
            <h3>Sinopse</h3>
            <p className="preserve-text">
              {movie.sinopse || 'Sinopse não disponível.'}
            </p>
          </section>
          {movie.url_backdrop && (
            <img
              className="detail-backdrop"
              src={movie.url_backdrop}
              alt={`Imagem de ${movie.titulo}`}
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
            />
          )}
          <ReviewForm
            movieId={id}
            user={user}
            disabled={confirming || busy || editingReview !== null || confirmingReview !== null}
            onBusy={setBusy}
            onCreated={() => {
              setReviewsLoading(true)
              setReviewPage(1)
              setReviewRefresh((value) => value + 1)
              setNotice('')
            }}
          />
          <section className="detail-section" aria-labelledby="reviews-title">
            <h3 id="reviews-title">
              Avaliações{' '}
              <span className="review-count">({data.reviews.total})</span>
            </h3>
            {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
            {reviewsLoading ? (
              <p role="status">Carregando avaliações…</p>
            ) : data.reviews.items.length === 0 ? (
              <p>Este filme ainda não recebeu avaliações.</p>
            ) : (
              <ul className="review-list">
                {data.reviews.items.map((review) => (
                  <li key={review.sk_movie_review_id}>
                    <div className="review-heading">
                      <strong>{review.nome}</strong>
                      <StarRatingDisplay value={review.nota} />
                    </div>
                    <p className="preserve-text">{review.comentario}</p>
                    <small>Registrada em {reviewDate(review.created_at)}</small>
                    {editingReview === review.sk_movie_review_id ? (
                      <ReviewEditForm
                        movieId={id}
                        review={review}
                        onBusy={setBusy}
                        onCancel={() => setEditingReview(null)}
                        onSaved={() => {
                          setEditingReview(null)
                          setReviewsLoading(true)
                          setReviewRefresh((value) => value + 1)
                          setNotice('Avaliação atualizada com sucesso.')
                        }}
                      />
                    ) : confirmingReview === review.sk_movie_review_id ? (
                      <div className="review-confirmation">
                        <p>Excluir esta avaliação permanentemente?</p>
                        <div className="detail-actions">
                          <button className="danger" disabled={busy} onClick={() => removeReview(review.sk_movie_review_id)}>
                            {busy ? 'Excluindo…' : 'Confirmar exclusão'}
                          </button>
                          <button className="secondary" disabled={busy} onClick={() => setConfirmingReview(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (user.role === 'admin' || review.user_id === user.id) ? (
                      <div className="review-actions">
                        <button
                          className="secondary"
                          disabled={busy || confirming}
                          onClick={() => {
                            setReviewError('')
                            setEditingReview(review.sk_movie_review_id)
                          }}
                        >Editar avaliação</button>
                        <button
                          className="secondary danger"
                          disabled={busy || confirming}
                          onClick={() => {
                            setReviewError('')
                            setConfirmingReview(review.sk_movie_review_id)
                          }}
                        >Excluir avaliação</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!reviewsLoading && data.reviews.total_pages > 1 && (
              <nav className="pagination review-pagination" aria-label="Paginação das avaliações">
                <button
                  className="secondary"
                  disabled={reviewPage <= 1 || busy}
                  onClick={() => {
                    setEditingReview(null)
                    setConfirmingReview(null)
                    setReviewsLoading(true)
                    setReviewPage((page) => page - 1)
                  }}
                >Anterior</button>
                <span>Página {data.reviews.page} de {data.reviews.total_pages}</span>
                <button
                  className="secondary"
                  disabled={reviewPage >= data.reviews.total_pages || busy}
                  onClick={() => {
                    setEditingReview(null)
                    setConfirmingReview(null)
                    setReviewsLoading(true)
                    setReviewPage((page) => page + 1)
                  }}
                >Próxima</button>
              </nav>
            )}
          </section>
        </>
      )}
    </dialog>
  )
}
