export interface QualityExample {
  movie_id: string
  title: string
  year: number | null
}

export interface QualityCheck {
  key: string
  label: string
  description: string
  count: number
  percentage: number
  examples: QualityExample[]
}

export interface QualityReport {
  generated_at: string
  total_movies: number
  total_reviews: number
  checks: QualityCheck[]
}
