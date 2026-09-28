export interface Movie {
  sk_movie_id: string
  id_filme: string
  titulo: string
  data_lancamento: string | null
  ano_lancamento: number | null
  duracao_minutos: number | null
  status_filme: string | null
  sinopse: string | null
  url_poster: string | null
  url_backdrop: string | null
  generos: string[]
  diretores: string[]
  total_avaliacoes: number
  /** Estrelas de 0 a 5; null quando não há avaliações. */
  media_avaliacoes: number | null
  is_favorite: boolean
  in_watchlist: boolean
}

export type MovieCollection = 'favorites' | 'watchlist'

export interface MovieCreate {
  titulo: string
  ano_lancamento: number
  sinopse: string
  generos: string[]
  diretores: string[]
  data_lancamento?: string | null
  duracao_minutos?: number | null
  status_filme?: string | null
  url_poster?: string | null
  url_backdrop?: string | null
}

export type MovieUpdate = Partial<MovieCreate>

export interface MoviePage {
  items: Movie[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface MovieQuery {
  page?: number
  page_size?: number
  q?: string
  collection?: MovieCollection
}

export interface ReviewCreate {
  nome: string
  /** Novas notas de 1 a 5 estrelas, incluindo decimais. */
  nota: number
  comentario: string
}

export interface Review extends ReviewCreate {
  sk_movie_review_id: string
  sk_movie_id: string
  created_at: string
  /** Notas históricas podem estar abaixo de 1 estrela. */
  nota: number
}

export interface ReviewList {
  items: Review[]
  total: number
  media_avaliacoes: number | null
}
