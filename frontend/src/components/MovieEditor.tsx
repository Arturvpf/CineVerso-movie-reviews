import { useEffect, useRef, useState } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie } from '../types/movie'
import type { User } from '../services/auth'
import { MovieForm } from './MovieForm'

export function MovieEditor({
  id,
  user,
  onClose,
  onSaved,
}: {
  id: string | 'new'
  user: User
  onClose: () => void
  onSaved: (movie: Movie) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [movie, setMovie] = useState<Movie>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

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
    if (id === 'new') return
    const controller = new AbortController()
    moviesApi
      .get(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setMovie(result)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar o filme.',
          )
      })
    return () => controller.abort()
  }, [id, attempt])

  return (
    <dialog
      ref={dialog}
      className="movie-dialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-header">
        <h2 id="editor-title">
          {id === 'new' ? 'Cadastrar filme' : 'Editar filme'}
        </h2>
        <button
          type="button"
          className="secondary"
          aria-label="Fechar formulário"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : id === 'new' || movie ? (
        <MovieForm
          movie={movie}
          userId={user.id}
          onSaved={onSaved}
          onCancel={onClose}
          onBusy={setBusy}
        />
      ) : (
        <p role="status">Carregando filme…</p>
      )}
    </dialog>
  )
}
