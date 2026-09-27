import { useEffect, useState } from 'react'
import { moviesApi } from './services/movies'
import './App.css'

type Connection =
  | { status: 'loading' }
  | { status: 'ready'; total: number }
  | { status: 'error'; message: string }

function App() {
  const [connection, setConnection] = useState<Connection>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    moviesApi.list({ page: 1, page_size: 1 }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setConnection({ status: 'ready', total: page.total })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConnection({ status: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar a biblioteca.' })
        }
      })
    return () => controller.abort()
  }, [attempt])

  function reconnect() {
    setConnection({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Rocket Lab Movie Reviews, início">
          <span className="brand-mark" aria-hidden="true">R.</span>
          <span>rocket lab<span className="brand-subtitle">MOVIE REVIEWS</span></span>
        </a>
        <span className="account">Administrador</span>
      </header>
      <main id="main-content">
        <p className="eyebrow">SEU ESPAÇO DE CINEMA</p>
        <h1>Boas histórias.<br /><span>Novas perspectivas.</span></h1>
        <p className="intro">Um lugar para reunir filmes, registrar impressões e dar valor a cada história.</p>
        <section className="overview" aria-labelledby="overview-title">
          <div className="overview-heading">
            <h2 id="overview-title">Sua biblioteca</h2>
            <span className="section-number" aria-hidden="true">01 / VISÃO GERAL</span>
          </div>
          <div className="connection" aria-live="polite" aria-busy={connection.status === 'loading'}>
            {connection.status === 'loading' && <p>Conectando à biblioteca…</p>}
            {connection.status === 'error' && (
              <div className="error-state" role="alert">
                <h3>Não conseguimos carregar sua biblioteca.</h3>
                <p>{connection.message}</p>
                <button onClick={reconnect}>Tentar novamente</button>
              </div>
            )}
            {connection.status === 'ready' && (
              <>
                <div><span className="movie-count">{connection.total.toLocaleString('pt-BR')}</span><p>Filmes no acervo</p></div>
                <div className="library-status"><span className="status-dot" aria-hidden="true" />Biblioteca disponível</div>
                {connection.total === 0 && <p>Seu acervo ainda não tem filmes cadastrados.</p>}
              </>
            )}
          </div>
        </section>
      </main>
      <footer><span>Rocket Lab Movie Reviews</span><span>Cada filme, um novo olhar.</span></footer>
    </div>
  )
}

export default App
