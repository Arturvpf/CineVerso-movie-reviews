export type ProblemCategory = 'site' | 'movie' | 'other'
export type ProblemStatus = 'open' | 'resolved'

export interface Problem {
  id: string
  user_id: string
  reporter_name: string
  reporter_email: string
  movie_id: string | null
  movie_title: string | null
  category: ProblemCategory
  subject: string
  description: string
  status: ProblemStatus
  created_at: string
  resolved_at: string | null
}

export interface ProblemPage {
  items: Problem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ProblemCreate {
  category: ProblemCategory
  subject: string
  description: string
  movie_id: string | null
}
