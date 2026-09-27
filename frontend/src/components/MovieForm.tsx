import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { moviesApi } from '../services/movies'
import type { Movie, MovieCreate, MovieUpdate } from '../types/movie'

function formValues(movie?: Movie) {
  return {
    titulo: movie?.titulo ?? '',
    diretores: movie?.diretores.join('; ') ?? '',
    generos: movie?.generos.join('; ') ?? '',
    ano_lancamento: movie?.ano_lancamento?.toString() ?? '',
    sinopse: movie?.sinopse ?? '',
    data_lancamento: movie?.data_lancamento ?? '',
    duracao_minutos: movie?.duracao_minutos?.toString() ?? '',
    status_filme: movie?.status_filme ?? '',
    url_poster: movie?.url_poster ?? '',
    url_backdrop: movie?.url_backdrop ?? '',
  }
}

type Values = ReturnType<typeof formValues>

export function MovieForm({
  movie,
  onSaved,
  onCancel,
  onBusy,
}: {
  movie?: Movie
  onSaved: (movie: Movie) => void
  onCancel: () => void
  onBusy: (busy: boolean) => void
}) {
  const [values, setValues] = useState(() => formValues(movie))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initial = formValues(movie)
  const changed = (key: keyof Values) => !movie || values[key] !== initial[key]
  const required = (key: keyof Values) => changed(key) || Boolean(initial[key])
  const input = (key: keyof Values) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((previous) => ({ ...previous, [key]: event.target.value })),
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    const payload: MovieUpdate = {}
    const names = (value: string) => [
      ...new Set(
        value
          .split(';')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ]
    if (changed('titulo')) payload.titulo = values.titulo.trim()
    if (changed('sinopse')) payload.sinopse = values.sinopse.trim()
    if (changed('diretores')) payload.diretores = names(values.diretores)
    if (changed('generos')) payload.generos = names(values.generos)
    if (changed('ano_lancamento'))
      payload.ano_lancamento = Number(values.ano_lancamento)
    if (changed('duracao_minutos'))
      payload.duracao_minutos = values.duracao_minutos
        ? Number(values.duracao_minutos)
        : null
    for (const key of [
      'data_lancamento',
      'status_filme',
      'url_poster',
      'url_backdrop',
    ] as const) {
      if (changed(key)) payload[key] = values[key].trim() || null
    }
    if (
      payload.titulo === '' ||
      payload.sinopse === '' ||
      payload.diretores?.length === 0 ||
      payload.generos?.length === 0
    ) {
      setError(
        'Preencha título, sinopse, diretores e gêneros com texto válido.',
      )
      return
    }
    if (
      payload.diretores?.some((name) => name.length > 255) ||
      payload.generos?.some((name) => name.length > 50)
    ) {
      setError(
        'Cada diretor deve ter até 255 caracteres e cada gênero, até 50.',
      )
      return
    }
    if (payload.duracao_minutos != null && payload.duracao_minutos <= 0) {
      setError('Informe uma duração maior que zero ou deixe o campo vazio.')
      return
    }
    if (!Object.keys(payload).length) {
      setError('Altere pelo menos um campo para salvar.')
      return
    }
    setBusy(true)
    onBusy(true)
    try {
      const saved = movie
        ? await moviesApi.update(movie.sk_movie_id, payload)
        : await moviesApi.create(payload as MovieCreate)
      onSaved(saved)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o filme.',
      )
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="form-help">
        Título, direção, ano, gênero e sinopse são obrigatórios no cadastro.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="form-grid">
        <div className="full">
          <label htmlFor="titulo">Título</label>
          <input
            {...input('titulo')}
            required={required('titulo')}
            maxLength={500}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="diretores">Diretores</label>
          <input
            {...input('diretores')}
            required={required('diretores')}
            aria-describedby="names-help"
          />
        </div>
        <div>
          <label htmlFor="generos">Gêneros</label>
          <input
            {...input('generos')}
            required={required('generos')}
            aria-describedby="names-help"
          />
        </div>
        <p id="names-help" className="form-help full">
          Separe múltiplos nomes com ponto e vírgula (;).
        </p>
        <div>
          <label htmlFor="ano_lancamento">Ano de lançamento</label>
          <input
            {...input('ano_lancamento')}
            type="number"
            min="1"
            max="9999"
            step="1"
            required={required('ano_lancamento')}
          />
        </div>
        <div>
          <label htmlFor="data_lancamento">Data de lançamento</label>
          <input {...input('data_lancamento')} type="date" />
        </div>
        <div>
          <label htmlFor="duracao_minutos">Duração (minutos)</label>
          <input
            {...input('duracao_minutos')}
            type="number"
            min={movie?.duracao_minutos === 0 ? 0 : 1}
            step="1"
          />
        </div>
        <div>
          <label htmlFor="status_filme">Status</label>
          <input
            {...input('status_filme')}
            maxLength={50}
            placeholder="Ex.: Lançado"
          />
        </div>
        <div className="full">
          <label htmlFor="sinopse">Sinopse</label>
          <textarea
            {...input('sinopse')}
            required={required('sinopse')}
            maxLength={4000}
            rows={4}
          />
        </div>
        <div className="full">
          <label htmlFor="url_poster">URL do pôster</label>
          <input
            {...input('url_poster')}
            type="url"
            pattern="https?://.*"
            maxLength={2048}
            placeholder="https://…"
          />
        </div>
        <div className="full">
          <label htmlFor="url_backdrop">URL da imagem de fundo</label>
          <input
            {...input('url_backdrop')}
            type="url"
            pattern="https?://.*"
            maxLength={2048}
            placeholder="https://…"
          />
        </div>
      </fieldset>
      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancelar
        </button>
        <button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : movie ? 'Salvar alterações' : 'Cadastrar filme'}
        </button>
      </div>
    </form>
  )
}
