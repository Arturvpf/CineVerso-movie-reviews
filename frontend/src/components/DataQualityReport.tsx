import { useEffect, useState } from 'react'
import { reportsApi } from '../services/reports'
import type { QualityReport } from '../types/report'

function downloadReport(report: QualityReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rocketlab-qualidade-${report.generated_at.slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataQualityReport({ onSelectMovie }: {
  onSelectMovie: (movieId: string) => void
}) {
  const [report, setReport] = useState<QualityReport>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    reportsApi.dataQuality(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setReport(result)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o relatório.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [refresh])

  function reload() {
    setError('')
    setLoading(true)
    setRefresh((value) => value + 1)
  }

  return (
    <section className="quality-report" aria-labelledby="quality-title">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">DIAGNÓSTICO DO CATÁLOGO</p>
          <h2 id="quality-title">Qualidade dos dados</h2>
        </div>
        {report && !loading && !error && (
          <div className="quality-actions">
            <button className="secondary" onClick={reload}>Atualizar</button>
            <button onClick={() => downloadReport(report)}>Baixar JSON</button>
          </div>
        )}
      </div>
      <p className="quality-intro">
        Verificações de preenchimento, vínculos e possíveis duplicatas. Um filme pode aparecer em
        mais de um indicador; a ausência de avaliações mede cobertura, não um erro do filme.
      </p>
      {loading && <p className="quality-loading" role="status">Analisando o catálogo…</p>}
      {error && (
        <div className="empty-state" role="alert">
          <h3>Não foi possível gerar o relatório.</h3>
          <p>{error}</p>
          <button onClick={reload}>Tentar novamente</button>
        </div>
      )}
      {!loading && !error && report && (
        <>
          <div className="quality-summary">
            <div><strong>{report.total_movies.toLocaleString('pt-BR')}</strong><span>filmes analisados</span></div>
            <div><strong>{report.total_reviews.toLocaleString('pt-BR')}</strong><span>avaliações registradas</span></div>
          </div>
          <p className="quality-timestamp">
            Gerado em {new Date(report.generated_at).toLocaleString('pt-BR')}. Os exemplos mostram até cinco filmes por indicador.
          </p>
          {report.total_movies === 0 ? (
            <div className="empty-state"><h3>O catálogo está vazio.</h3><p>Cadastre ou importe filmes para gerar os indicadores.</p></div>
          ) : (
            <div className="quality-grid">
              {report.checks.map((check) => (
                <article className="quality-card" key={check.key}>
                  <div className="quality-card-heading">
                    <h3>{check.label}</h3>
                    <strong>{check.count.toLocaleString('pt-BR')}</strong>
                  </div>
                  <p className="quality-percentage">{check.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}% dos filmes</p>
                  <p>{check.description}</p>
                  {check.examples.length > 0 && (
                    <div className="quality-examples">
                      <h4>Exemplos para revisar</h4>
                      <ul>
                        {check.examples.map((movie) => (
                          <li key={movie.movie_id}>
                            <span>{movie.title || '(Sem título)'}{movie.year ? ` (${movie.year})` : ''}</span>
                            <button
                              className="secondary"
                              aria-label={`Ver filme ${movie.title || 'sem título'}`}
                              onClick={() => onSelectMovie(movie.movie_id)}
                            >
                              Ver filme
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
