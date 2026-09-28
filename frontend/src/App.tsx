import { useEffect, useState } from 'react'
import { ApiError, apiUrl } from './services/http'
import { authApi, type User } from './services/auth'
import { AuthScreen } from './components/AuthScreen'
import { Catalog } from './components/Catalog'
import { DataQualityReport } from './components/DataQualityReport'
import { MyReviews } from './components/MyReviews'
import { AdminProblemInbox, ReportProblem } from './components/ProblemCenter'
import { Trends } from './components/Trends'
import { Profile } from './components/Profile'
import { movieIdFromPath, pathForMovie } from './services/movieUrl'
import './App.css'

function App() {
  const [view, setView] = useState<
    'catalog' | 'trends' | 'my_reviews' | 'report_problem' | 'problem_inbox' | 'quality' | 'profile'
  >('catalog')
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(
    () => movieIdFromPath(window.location.pathname),
  )
  const [reportMovieId, setReportMovieId] = useState<string | null>(null)
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
      if (movieId) setView((current) =>
        ['catalog', 'trends', 'my_reviews'].includes(current) ? current : 'catalog')
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  function openMovie(movieId: string) {
    window.history.pushState({ rocketlabMovie: true }, '', pathForMovie(movieId))
    setSelectedMovieId(movieId)
    if (!['catalog', 'trends', 'my_reviews'].includes(view)) setView('catalog')
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

  function selectView(next: typeof view) {
    closeMovie()
    if (next === 'report_problem') setReportMovieId(null)
    setView(next)
  }

  function reportMovieProblem(movieId: string) {
    closeMovie(true)
    setReportMovieId(movieId)
    setView('report_problem')
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
      {user && <div className="account-actions"><button className="account-link" onClick={() => selectView('profile')}>
        <span className="account-avatar">{user.avatar_url ? <img src={apiUrl(user.avatar_url)} alt="" /> : user.display_name.charAt(0).toUpperCase()}</span>
        <span className="account">{user.display_name}{user.role === 'admin' ? ' · Administrador' : ''}</span>
      </button>
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
          <button className={view === 'my_reviews' ? 'active' : ''} aria-current={view === 'my_reviews' ? 'page' : undefined}
            onClick={() => selectView('my_reviews')}>Minhas reviews</button>
          <button className={view === 'profile' ? 'active' : ''} aria-current={view === 'profile' ? 'page' : undefined}
            onClick={() => selectView('profile')}>Meu perfil</button>
          <button className={view === 'report_problem' ? 'active' : ''} aria-current={view === 'report_problem' ? 'page' : undefined}
            onClick={() => selectView('report_problem')}>Relatar problema</button>
          {user.role === 'admin' && <button className={view === 'problem_inbox' ? 'active' : ''}
            aria-current={view === 'problem_inbox' ? 'page' : undefined}
            onClick={() => selectView('problem_inbox')}>Problemas recebidos</button>}
          {user.role === 'admin' && <button className={view === 'quality' ? 'active' : ''} aria-current={view === 'quality' ? 'page' : undefined}
            onClick={() => selectView('quality')}>Qualidade dos dados</button>}
        </nav>
        {view === 'catalog' ? <Catalog user={user} selectedMovieId={selectedMovieId}
            onOpenMovie={openMovie} onCloseMovie={closeMovie}
            onReportProblem={reportMovieProblem} />
          : view === 'trends' ? <Trends user={user} selectedMovieId={selectedMovieId}
            onOpenMovie={openMovie} onCloseMovie={closeMovie}
            onReportProblem={reportMovieProblem} />
          : view === 'my_reviews' ? <MyReviews user={user} selectedMovieId={selectedMovieId}
            onOpenMovie={openMovie} onCloseMovie={closeMovie}
            onReportProblem={reportMovieProblem} />
          : view === 'report_problem' ? <ReportProblem key={reportMovieId ?? 'general'}
            user={user} initialMovieId={reportMovieId} />
          : view === 'profile' ? <Profile user={user} onUpdated={setUser} />
          : view === 'problem_inbox' && user.role === 'admin' ? <AdminProblemInbox />
          : user.role === 'admin' ? <DataQualityReport onSelectMovie={(movieId) => {
            openMovie(movieId)
          }} /> : null}
      </main>}
    <footer><span>Rocket Lab Movie Reviews</span><span>Cada filme, um novo olhar.</span></footer>
  </div>
}

export default App
