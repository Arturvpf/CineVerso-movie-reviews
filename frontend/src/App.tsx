import { useEffect, useState } from 'react'
import { ApiError, apiUrl, SESSION_EXPIRED_EVENT } from './services/http'
import { authApi, type User } from './services/auth'
import { AuthScreen } from './components/AuthScreen'
import { Catalog } from './components/Catalog'
import { DataQualityReport } from './components/DataQualityReport'
import { MyReviews } from './components/MyReviews'
import { AdminProblemInbox, ReportProblem } from './components/ProblemCenter'
import { Trends } from './components/Trends'
import { Profile } from './components/Profile'
import { AvatarImage } from './components/AvatarImage'
import { movieIdFromPath, pathForMovie } from './services/movieUrl'
import { initialTheme, savedTheme, saveTheme, type Theme } from './services/theme'
import './App.css'

function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
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
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', theme === 'dark' ? '#0e181d' : '#f5f3ed',
    )
  }, [theme])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = () => {
      if (!savedTheme()) setTheme(preference.matches ? 'dark' : 'light')
    }
    preference.addEventListener('change', syncSystemTheme)
    return () => preference.removeEventListener('change', syncSystemTheme)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    saveTheme(next)
  }

  useEffect(() => {
    const expireSession = () => {
      setUser(null)
      setView('catalog')
      setAuthError('Sua sessão terminou. Entre novamente para continuar.')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
  }, [])

  useEffect(() => {
    authApi.me().then(setUser).catch((cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) setAuthError('')
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
      if (cause instanceof ApiError && cause.status === 401) {
        setUser(null)
        setAuthError('')
        selectView('catalog')
        return
      }
      setAuthError(cause instanceof Error ? cause.message : 'Não foi possível sair da conta.')
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="CineVerso, início">
        <span className="brand-mark" aria-hidden="true">C.</span>
        <span>CineVerso<span className="brand-subtitle">FILMES & HISTÓRIAS</span></span>
      </a>
      <div className="account-actions">
        <button type="button" className="theme-toggle" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
          <span className="theme-icon" aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
        </button>
      {user && <><button className="account-link" onClick={() => selectView('profile')}>
        <span className="account-avatar"><AvatarImage key={user.avatar_url}
          src={user.avatar_url ? apiUrl(user.avatar_url) : null} name={user.display_name} /></span>
        <span className="account">{user.display_name}{user.role === 'admin' ? ' · Administrador' : ''}</span>
      </button>
        <button className="secondary logout-button" onClick={logout}>Sair</button></>}
      </div>
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
    <footer><span>CineVerso</span><span>Cada filme, um novo olhar.</span></footer>
  </div>
}

export default App
