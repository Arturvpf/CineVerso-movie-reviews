import type { Movie, MovieCreate, MoviePage, MovieQuery, MovieUpdate, Review, ReviewCreate, ReviewList } from '../types/movie'
import { request } from './http'

const pathFor = (id: string) => `/api/v1/movies/${encodeURIComponent(id)}`

export const moviesApi = {
  list(query: MovieQuery = {}, signal?: AbortSignal): Promise<MoviePage> {
    const params = new URLSearchParams()
    if (query.page !== undefined) params.set('page', String(query.page))
    if (query.page_size !== undefined) params.set('page_size', String(query.page_size))
    if (query.q !== undefined) params.set('q', query.q)
    const suffix = params.size ? `?${params.toString()}` : ''
    return request(`/api/v1/movies${suffix}`, { signal })
  },
  get(id: string, signal?: AbortSignal): Promise<Movie> {
    return request(pathFor(id), { signal })
  },
  create(payload: MovieCreate): Promise<Movie> {
    return request('/api/v1/movies', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: string, payload: MovieUpdate): Promise<Movie> {
    return request(pathFor(id), { method: 'PATCH', body: JSON.stringify(payload) })
  },
  remove(id: string): Promise<void> {
    return request(pathFor(id), { method: 'DELETE' })
  },
  reviews(id: string, signal?: AbortSignal): Promise<ReviewList> {
    return request(`${pathFor(id)}/reviews`, { signal })
  },
  addReview(id: string, payload: ReviewCreate): Promise<Review> {
    return request(`${pathFor(id)}/reviews`, { method: 'POST', body: JSON.stringify(payload) })
  },
}
