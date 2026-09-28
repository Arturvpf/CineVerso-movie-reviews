import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '../services/auth'
import { draftKey, useFormDraft } from '../services/drafts'
import { movieIdFromPath, pathForMovie } from '../services/movieUrl'
import { problemsApi } from '../services/problems'
import type { Problem, ProblemCategory, ProblemPage, ProblemStatus } from '../types/problem'

const categoryLabels: Record<ProblemCategory, string> = {
  site: 'Problema no site', movie: 'Informações de um filme', other: 'Outro problema',
}
const emptyForm = {
  category: 'site' as ProblemCategory, subject: '', description: '', movieLink: '',
}

function statusLabel(status: ProblemStatus) {
  return status === 'open' ? 'Aberto' : 'Resolvido'
}

function dateLabel(value: string) {
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? 'Data não disponível' : date.toLocaleString('pt-BR')
}

function ProblemCard({ problem, admin = false, busy = false, onToggle }: {
  problem: Problem
  admin?: boolean
  busy?: boolean
  onToggle?: (problem: Problem) => void
}) {
  return <article className="problem-card">
    <div className="problem-card-header"><div>
      <span className={`problem-status ${problem.status}`}>{statusLabel(problem.status)}</span>
      <span className="problem-category">{categoryLabels[problem.category]}</span>
      <h3>{problem.subject}</h3>
    </div><small>{dateLabel(problem.created_at)}</small></div>
    {admin && <p className="problem-reporter">Enviado por <strong>{problem.reporter_name}</strong> · {problem.reporter_email}</p>}
    <p className="preserve-text">{problem.description}</p>
    {problem.movie_id && <p className="problem-movie">Filme: <a href={pathForMovie(problem.movie_id)}>{problem.movie_title ?? 'Ver filme'}</a></p>}
    {admin && onToggle && <button className={problem.status === 'resolved' ? 'secondary' : ''}
      disabled={busy} onClick={() => onToggle(problem)}>
      {busy ? 'Salvando…' : problem.status === 'open' ? 'Marcar como resolvido' : 'Reabrir relato'}
    </button>}
  </article>
}

export function ReportProblem({ user, initialMovieId = null }: {
  user: User
  initialMovieId?: string | null
}) {
  const initialForm = initialMovieId ? {
    ...emptyForm, category: 'movie' as ProblemCategory,
    movieLink: `${window.location.origin}${pathForMovie(initialMovieId)}`,
  } : emptyForm
  const { values, setValues, hasDraft, clearDraft, discardDraft } = useFormDraft(
    draftKey(user.id, 'problem', initialMovieId ?? 'new'), initialForm,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProblemPage>()
  const [listError, setListError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    problemsApi.mine(page, controller.signal).then((result) => {
      if (page > Math.max(1, result.total_pages)) {
        setPage(Math.max(1, result.total_pages))
        return
      }
      setData(result)
      setListError('')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus relatos.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [page, refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setSuccess('')
    let movieId: string | null = null
    if (values.movieLink.trim()) {
      try {
        const link = new URL(values.movieLink.trim(), window.location.origin)
        movieId = link.origin === window.location.origin ? movieIdFromPath(link.pathname) : null
      } catch {
        movieId = null
      }
      if (!movieId) {
        setError('Informe um link de filme deste site ou deixe o campo vazio.')
        return
      }
    }
    setBusy(true)
    try {
      await problemsApi.create({
        category: values.category, subject: values.subject.trim(),
        description: values.description.trim(), movie_id: movieId,
      })
      clearDraft()
      setValues(initialForm)
      setSuccess('Relato enviado. Ele já está disponível para o administrador.')
      setPage(1)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o relato.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="catalog" aria-labelledby="report-problem-title">
    <div className="catalog-heading"><div><p className="eyebrow">AJUDE A MELHORAR</p>
      <h2 id="report-problem-title">Relatar problema</h2></div></div>
    <p className="quality-intro">Conte o que aconteceu. O administrador verá seu relato em uma caixa de entrada própria.</p>
    <form className="problem-form" onSubmit={submit}>
      {hasDraft && <div className="draft-notice" role="status"><span>Rascunho salvo neste navegador.</span>
        <button type="button" className="secondary" disabled={busy} onClick={discardDraft}>Descartar rascunho</button></div>}
      {success && <p className="success-notice" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <fieldset className="form-grid" disabled={busy}>
        <div><label htmlFor="problem-category">Tipo de problema</label>
          <select id="problem-category" value={values.category} onChange={(event) =>
            setValues((previous) => ({ ...previous, category: event.target.value as ProblemCategory }))}>
            {Object.entries(categoryLabels).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="full"><label htmlFor="problem-subject">Assunto</label>
          <input id="problem-subject" value={values.subject} minLength={5} maxLength={160}
            placeholder="Resuma o problema" required onChange={(event) =>
              setValues((previous) => ({ ...previous, subject: event.target.value }))} /></div>
        <div className="full"><label htmlFor="problem-description">O que aconteceu?</label>
          <textarea id="problem-description" value={values.description} minLength={10} maxLength={4000}
            rows={5} placeholder="Descreva o problema e como encontrá-lo" required onChange={(event) =>
              setValues((previous) => ({ ...previous, description: event.target.value }))} /></div>
        <div className="full"><label htmlFor="problem-movie-link">Link do filme (opcional)</label>
          <input id="problem-movie-link" type="url" value={values.movieLink}
            placeholder="Cole o link do filme" onChange={(event) =>
              setValues((previous) => ({ ...previous, movieLink: event.target.value }))} />
          <p className="form-help">Se o problema for de um filme, cole o link que aparece nos detalhes.</p></div>
      </fieldset>
      <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar relato'}</button>
    </form>
    <section className="problem-history" aria-labelledby="my-problems-title">
      <div className="problem-history-heading"><h3 id="my-problems-title">Meus relatos</h3>
        <button className="secondary" onClick={() => {
          setLoading(true); setRefresh((value) => value + 1)
        }}>Atualizar</button></div>
      {loading ? <p role="status">Carregando relatos…</p>
        : listError ? <div className="form-error" role="alert">{listError}
          <button className="secondary" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button></div>
        : !data?.items.length ? <p>Você ainda não enviou relatos.</p>
        : <><div className="problem-list">{data.items.map((problem) =>
          <ProblemCard key={problem.id} problem={problem} />)}</div>
          {data.total_pages > 1 && <nav className="pagination" aria-label="Páginas dos seus relatos">
            <button className="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setLoading(true) }}>Anterior</button>
            <span>Página {page} de {data.total_pages}</span>
            <button className="secondary" disabled={page >= data.total_pages} onClick={() => { setPage(page + 1); setLoading(true) }}>Próxima</button>
          </nav>}</>}
    </section>
  </section>
}

export function AdminProblemInbox() {
  const [filter, setFilter] = useState<ProblemStatus | undefined>('open')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProblemPage>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    problemsApi.inbox(page, filter, controller.signal).then((result) => {
      if (page > Math.max(1, result.total_pages)) {
        setPage(Math.max(1, result.total_pages))
        return
      }
      setData(result)
      setError('')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os relatos.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [page, filter, refresh])

  async function toggle(problem: Problem) {
    setBusyId(problem.id)
    setActionError('')
    try {
      await problemsApi.updateStatus(problem.id, problem.status === 'open' ? 'resolved' : 'open')
      setRefresh((value) => value + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o relato.')
    } finally {
      setBusyId(null)
    }
  }

  return <section className="catalog" aria-labelledby="problem-inbox-title">
    <div className="catalog-heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p>
      <h2 id="problem-inbox-title">Problemas recebidos</h2></div>
      <button className="secondary" onClick={() => { setLoading(true); setRefresh((value) => value + 1) }}>
        Atualizar
      </button></div>
    <nav className="collection-tabs" aria-label="Filtrar relatos">
      {([['open', 'Abertos'], [undefined, 'Todos'], ['resolved', 'Resolvidos']] as const)
        .map(([value, label]) => <button key={label} type="button"
          className={filter === value ? 'active' : ''} aria-current={filter === value ? 'page' : undefined}
          onClick={() => {
            if (filter === value && page === 1) return
            setFilter(value); setPage(1); setLoading(true)
          }}>{label}</button>)}
    </nav>
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    {loading ? <p role="status">Carregando relatos…</p>
      : error ? <div className="empty-state" role="alert"><p>{error}</p>
        <button onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button></div>
      : !data?.items.length ? <div className="empty-state"><h3>Nenhum relato nesta lista</h3></div>
      : <><p className="review-count">{data.total.toLocaleString('pt-BR')} relatos</p>
        <div className="problem-list">{data.items.map((problem) => <ProblemCard key={problem.id}
          problem={problem} admin busy={busyId === problem.id} onToggle={toggle} />)}</div>
        {data.total_pages > 1 && <nav className="pagination" aria-label="Páginas dos relatos recebidos">
          <button className="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setLoading(true) }}>Anterior</button>
          <span>Página {page} de {data.total_pages}</span>
          <button className="secondary" disabled={page >= data.total_pages} onClick={() => { setPage(page + 1); setLoading(true) }}>Próxima</button>
        </nav>}</>}
  </section>
}
