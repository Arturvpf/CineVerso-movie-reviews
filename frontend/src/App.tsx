import { useEffect, useState } from 'react'
import { ApiError } from './services/http'
import { authApi, type User } from './services/auth'
import { AuthScreen } from './components/AuthScreen'
import { Catalog } from './components/Catalog'
import { DataQualityReport } from './components/DataQualityReport'
import { Trends } from './components/Trends'
import { movieIdFromPath, pathForMovie } from './services/movieUrl'
import './App.css'

function App() {
  const [view, setView] = useState<'catalog' | 'trends' | 'quality'>('catalog')
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(
    () => movieIdFromPath(window.location.pathname),
  )
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    authApi.me().then(setUser).catch((cause: unknown) => {
      if (!(cause instanceof ApiError && cause.status === 401))
        setAuthError(cause instanceof Error ? cause.message : 'Não foi possível verificar sua sessão.')
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const syncLocation = () => {
      const movieId = movieIdFromPath(window.location.pathname)
      setSelectedMovieId(movieId)
      if (movieId) setView((current) => current === 'quality' ? 'catalog' : current)
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  function openMovie(movieId: string) {
    window.history.pushState({ rocketlabMovie: true }, '', pathForMovie(movieId))
    setSelectedMovieId(movieId)
    if (view === 'quality') setView('catalog')
  }

  function closeMovie(replace = false) {
    if (movieIdFromPath(window.location.pathname) && !replace && window.history.state?.rocketlabMovie) {
      window.history.back()
      return
    }
    if (movieIdFromPath(window.location.pathname)) {
      window.history.replaceState({}, '', '/')
    }
    setSelectedMovieId(null)
  }

  function selectView(next: 'catalog' | 'trends' | 'quality') {
    closeMovie()
    setView(next)
  }

  async function logout() {
    try {
      await authApi.logout()
      setUser(null)
      selectView('catalog')
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Não foi possível sair da conta.')
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Rocket Lab Movie Reviews, início">
        <span className="brand-mark" aria-hidden="true">R.</span>
        <span>rocket lab<span className="brand-subtitle">MOVIE REVIEWS</span></span>
      </a>
      {user && <div className="account-actions"><span className="account">{user.display_name}{user.role === 'admin' ? ' · Administrador' : ''}</span>
        <button className="secondary" onClick={logout}>Sair</button></div>}
    </header>
    {authError && <p className="form-error" role="alert">{authError}</p>}
    {loading ? <main><p role="status">Verificando sua sessão…</p></main>
      : !user ? <AuthScreen onAuthenticated={(account) => { setUser(account); setAuthError('') }} />
      : <main id="main-content">
        <p className="eyebrow">SEU ESPAÇO DE CINEMA</p>
        <h1>Boas histórias.<br /><span>Novas perspectivas.</span></h1>
        <p className="intro">Um lugar para reunir filmes, registrar impressões e dar valor a cada história.</p>
        <nav className="main-sections" aria-label="Seções do projeto">
          <button className={view === 'catalog' ? 'active' : ''} aria-current={view === 'catalog' ? 'page' : undefined}
            onClick={() => selectView('catalog')}>Catálogo</button>
          <button className={view === 'trends' ? 'active' : ''} aria-current={view === 'trends' ? 'page' : undefined}
            onClick={() => selectView('trends')}>Tendências</button>
          {user.role === 'admin' && <button className={view === 'quality' ? 'active' : ''} aria-current={view === 'quality' ? 'page' : undefined}
            onClick={() => selectView('quality')}>Qualidade dos dados</button>}
        </nav>
        {view === 'catalog' ? <Catalog user={user} selectedMovieId={selectedMovieId}
            onOpenMovie={openMovie} onCloseMovie={closeMovie} />
          : view === 'trends' ? <Trends user={user} selectedMovieId={selectedMovieId}
            onOpenMovie={openMovie} onCloseMovie={closeMovie} />
          : user.role === 'admin' ? <DataQualityReport onSelectMovie={(movieId) => {
            openMovie(movieId)
          }} /> : null}
      </main>}
    <footer><span>Rocket Lab Movie Reviews</span><span>Cada filme, um novo olhar.</span></footer>
  </div>
}

export default App
