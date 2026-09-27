import { Catalog } from './components/Catalog'
import './App.css'

function App() {
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
        <Catalog />
      </main>
      <footer>
        <span>Rocket Lab Movie Reviews</span>
        <span>Cada filme, um novo olhar.</span>
      </footer>
    </div>
  )
}

export default App
