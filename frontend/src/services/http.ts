const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
export const apiUrl = (path: string) => `${API_URL}${path}`

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function errorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail = data.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null || !('msg' in entry)) return []
        if (typeof entry.msg !== 'string') return []
        const field = 'loc' in entry && Array.isArray(entry.loc)
          ? entry.loc.filter((part: unknown) => part !== 'body' && part !== 'query').join('.')
          : ''
        return [field ? `${field}: ${entry.msg}` : entry.msg]
      })
      if (messages.length) return messages.join('; ')
    }
  }
  return `Não foi possível concluir a solicitação (HTTP ${status}).`
}

export async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    const csrf = document.cookie.split('; ').find((part) =>
      part.startsWith('rocketlab_csrf=') || part.startsWith('__Host-rocketlab_csrf='))?.split('=')[1]
    if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal, credentials: 'include' })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new ApiError('A conexão demorou demais. Tente novamente.', 0)
    throw new ApiError('Não foi possível conectar à biblioteca. Tente novamente.', 0)
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    throw new ApiError(errorMessage(data, response.status), response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
