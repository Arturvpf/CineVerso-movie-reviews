import { useEffect, useState } from 'react'
import { ApiError } from './services/http'
import { authApi, type User } from './services/auth'
import { AuthScreen } from './components/AuthScreen'
import { Catalog } from './components/Catalog'
import { DataQualityReport } from './components/DataQualityReport'
import { Trends } from './components/Trends'
import './App.css'

function App() {
  const [view, setView] = useState<'catalog' | 'trends' | 'quality'>('catalog')
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    authApi.me().then(setUser).catch((cause: unknown) => {
      if (!(cause instanceof ApiError && cause.status === 401))
        setAuthError(cause instanceof Error ? cause.message : 'Não foi possível verificar sua sessão.')
    }).finally(() => setLoading(false))
  }, [])

  async function logout() {
    try {
      await authApi.logout()
      setUser(null)
      setView('catalog')
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
            onClick={() => { setSelectedMovieId(null); setView('catalog') }}>Catálogo</button>
          <button className={view === 'trends' ? 'active' : ''} aria-current={view === 'trends' ? 'page' : undefined}
            onClick={() => { setSelectedMovieId(null); setView('trends') }}>Tendências</button>
          {user.role === 'admin' && <button className={view === 'quality' ? 'active' : ''} aria-current={view === 'quality' ? 'page' : undefined}
            onClick={() => { setSelectedMovieId(null); setView('quality') }}>Qualidade dos dados</button>}
        </nav>
        {view === 'catalog' ? <Catalog user={user} initialMovieId={selectedMovieId} />
          : view === 'trends' ? <Trends user={user} />
          : user.role === 'admin' ? <DataQualityReport onSelectMovie={(movieId) => {
            setSelectedMovieId(movieId); setView('catalog')
          }} /> : null}
      </main>}
    <footer><span>Rocket Lab Movie Reviews</span><span>Cada filme, um novo olhar.</span></footer>
  </div>
}

export default App
