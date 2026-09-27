import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/http'
import { moviesApi } from '../services/movies'
import type { Movie, ReviewList } from '../types/movie'
import { MovieForm } from './MovieForm'

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

export function MovieDetails({
  id,
  onClose,
  onUpdated,
  onDeleted,
}: {
  id: string
  onClose: () => void
  onUpdated: (movie: Movie) => void
  onDeleted: (movie: Movie) => void
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
      moviesApi.reviews(id, controller.signal),
    ])
      .then(([movie, reviews]) => {
        if (!controller.signal.aborted) setData({ movie, reviews })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setMissing(cause instanceof ApiError && cause.status === 404)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os detalhes.',
        )
      })
    return () => controller.abort()
  }, [id, attempt])

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
                  : `★ ${data.reviews.media_avaliacoes.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / 5`}
              </p>
              <div className="detail-actions">
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
              </div>
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
          <section className="detail-section" aria-labelledby="reviews-title">
            <h3 id="reviews-title">
              Avaliações{' '}
              <span className="review-count">({data.reviews.total})</span>
            </h3>
            {data.reviews.items.length === 0 ? (
              <p>Este filme ainda não recebeu avaliações.</p>
            ) : (
              <ul className="review-list">
                {data.reviews.items.map((review) => (
                  <li key={review.sk_movie_review_id}>
                    <div className="review-heading">
                      <strong>{review.nome}</strong>
                      <span aria-label={`Nota ${review.nota} de 5 estrelas`}>
                        ★ {review.nota.toLocaleString('pt-BR')} / 5
                      </span>
                    </div>
                    <p className="preserve-text">{review.comentario}</p>
                    <small>Registrada em {reviewDate(review.created_at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </dialog>
  )
}
