import type { Movie, MovieCollection, MovieCreate, MoviePage, MovieQuery, MovieUpdate, Review, ReviewCreate, ReviewList, ReviewUpdate } from '../types/movie'
import { request } from './http'

const pathFor = (id: string) => `/api/v1/movies/${encodeURIComponent(id)}`

export const moviesApi = {
  list(query: MovieQuery = {}, signal?: AbortSignal): Promise<MoviePage> {
    const params = new URLSearchParams()
    if (query.page !== undefined) params.set('page', String(query.page))
    if (query.page_size !== undefined) params.set('page_size', String(query.page_size))
    if (query.q !== undefined) params.set('q', query.q)
    if (query.collection !== undefined) params.set('collection', query.collection)
    if (query.genre !== undefined) params.set('genre', query.genre)
    if (query.min_rating !== undefined) params.set('min_rating', String(query.min_rating))
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
  genres(signal?: AbortSignal): Promise<string[]> {
    return request('/api/v1/movies/genres', { signal })
  },
  addToCollection(id: string, collection: MovieCollection): Promise<Movie> {
    return request(`${pathFor(id)}/collections/${collection}`, { method: 'PUT' })
  },
  removeFromCollection(id: string, collection: MovieCollection): Promise<void> {
    return request(`${pathFor(id)}/collections/${collection}`, { method: 'DELETE' })
  },
  reviews(id: string, page = 1, pageSize = 10, signal?: AbortSignal): Promise<ReviewList> {
    return request(`${pathFor(id)}/reviews?page=${page}&page_size=${pageSize}`, { signal })
  },
  addReview(id: string, payload: ReviewCreate): Promise<Review> {
    return request(`${pathFor(id)}/reviews`, { method: 'POST', body: JSON.stringify(payload) })
  },
  updateReview(id: string, reviewId: string, payload: ReviewUpdate): Promise<Review> {
    return request(`${pathFor(id)}/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    })
  },
  removeReview(id: string, reviewId: string): Promise<void> {
    return request(`${pathFor(id)}/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' })
  },
}
