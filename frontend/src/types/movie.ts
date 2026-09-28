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

export interface PersonCredit { id: string; nome: string }
export interface CompanyCredit { id: string; nome: string }

export interface MoviePerformance {
  popularidade: number | null
  nota_tmdb: number | null
  qtd_tmdb: number | null
  nota_imdb: number | null
  qtd_imdb: number | null
  orcamento_usd: string | null
  receita_usd: string | null
  lucro_usd: string
  orcamento_brl: string | null
  receita_brl: string | null
  lucro_brl: string
}

export interface MovieDetail extends Movie {
  elenco: PersonCredit[]
  roteiristas: PersonCredit[]
  direcao: PersonCredit[]
  produtoras: CompanyCredit[]
  indicadores: MoviePerformance | null
  resumo_base: { quantidade: number; nota_media_0_a_10: number | null } | null
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
  genre?: string
  min_rating?: number
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
  user_id: string | null
  created_at: string
  /** Notas históricas podem estar abaixo de 1 estrela. */
  nota: number
}

export type ReviewUpdate = Partial<ReviewCreate>

export interface ReviewList {
  items: Review[]
  total: number
  media_avaliacoes: number | null
  page: number
  page_size: number
  total_pages: number
  my_review_id: string | null
}

export interface MyReview extends Review {
  movie_title: string
  movie_poster: string | null
}

export interface MyReviewPage {
  items: MyReview[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
