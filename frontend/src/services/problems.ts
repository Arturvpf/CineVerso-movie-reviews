import type { Problem, ProblemCreate, ProblemPage, ProblemStatus } from '../types/problem'
import { request } from './http'

export const problemsApi = {
  create(payload: ProblemCreate): Promise<Problem> {
    return request('/api/v1/reports/problems', {
      method: 'POST', body: JSON.stringify(payload),
    })
  },
  mine(page = 1, signal?: AbortSignal): Promise<ProblemPage> {
    return request(`/api/v1/reports/problems/mine?page=${page}`, { signal })
  },
  inbox(page = 1, status?: ProblemStatus, signal?: AbortSignal): Promise<ProblemPage> {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return request(`/api/v1/reports/problems/inbox?${params.toString()}`, { signal })
  },
  updateStatus(id: string, status: ProblemStatus): Promise<Problem> {
    return request(`/api/v1/reports/problems/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
  },
}
