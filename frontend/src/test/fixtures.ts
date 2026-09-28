import type { User } from '../services/auth'
import type { MovieDetail, Review, ReviewList } from '../types/movie'

export const admin: User = {
  id: 'admin', email: 'admin@example.com', display_name: 'Ana', role: 'admin',
  created_at: '2026-01-01T00:00:00', avatar_url: null,
}
export const movie: MovieDetail = {
  sk_movie_id: 'movie-1', id_filme: '1', titulo: 'Interestelar', ano_lancamento: 2014,
  data_lancamento: null, duracao_minutos: 169, status_filme: null, sinopse: 'Uma viagem espacial.',
  url_poster: null, url_backdrop: null, generos: ['Drama'], diretores: ['Nolan'],
  total_avaliacoes: 0, media_avaliacoes: null, is_favorite: false, in_watchlist: false,
  elenco: [], roteiristas: [], direcao: [], produtoras: [], indicadores: null, resumo_base: null,
}
export const review: Review = {
  sk_movie_review_id: 'review-1', sk_movie_id: movie.sk_movie_id, user_id: admin.id,
  nome: admin.display_name, nota: 4, comentario: 'Ótimo filme.', created_at: '2026-01-01T00:00:00',
}
export const emptyReviews: ReviewList = {
  items: [], total: 0, page: 1, page_size: 10, total_pages: 0,
  media_avaliacoes: null, my_review_id: null,
}
export const moviePage = { items: [movie], total: 1, page: 1, page_size: 12, total_pages: 1 }
