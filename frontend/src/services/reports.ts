import type { QualityReport } from '../types/report'
import { request } from './http'

export const reportsApi = {
  dataQuality(signal?: AbortSignal): Promise<QualityReport> {
    return request('/api/v1/reports/data-quality', { signal })
  },
}
