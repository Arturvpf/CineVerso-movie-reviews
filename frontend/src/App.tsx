import { useState } from 'react'
import { Catalog } from './components/Catalog'
import { DataQualityReport } from './components/DataQualityReport'
import './App.css'

function App() {
  const [view, setView] = useState<'catalog' | 'quality'>('catalog')
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Rocket Lab Movie Reviews, início"
        >
          <span className="brand-mark" aria-hidden="true">
            R.
          </span>
          <span>
            rocket lab<span className="brand-subtitle">MOVIE REVIEWS</span>
          </span>
        </a>
        <span className="account">Administrador</span>
      </header>
      <main id="main-content">
        <p className="eyebrow">SEU ESPAÇO DE CINEMA</p>
        <h1>
          Boas histórias.
          <br />
          <span>Novas perspectivas.</span>
        </h1>
        <p className="intro">
          Um lugar para reunir filmes, registrar impressões e dar valor a cada
          história.
        </p>
        <nav className="main-sections" aria-label="Seções do projeto">
          <button
            className={view === 'catalog' ? 'active' : ''}
            aria-current={view === 'catalog' ? 'page' : undefined}
            onClick={() => {
              setSelectedMovieId(null)
              setView('catalog')
            }}
          >Catálogo</button>
          <button
            className={view === 'quality' ? 'active' : ''}
            aria-current={view === 'quality' ? 'page' : undefined}
            onClick={() => {
              setSelectedMovieId(null)
              setView('quality')
            }}
          >Qualidade dos dados</button>
        </nav>
        {view === 'catalog' ? (
          <Catalog initialMovieId={selectedMovieId} />
        ) : (
          <DataQualityReport onSelectMovie={(movieId) => {
            setSelectedMovieId(movieId)
            setView('catalog')
          }} />
        )}
      </main>
      <footer>
        <span>Rocket Lab Movie Reviews</span>
        <span>Cada filme, um novo olhar.</span>
      </footer>
    </div>
  )
}

export default App
