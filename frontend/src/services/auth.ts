import { request } from './http'

export interface User {
  id: string
  email: string
  display_name: string
  role: 'admin' | 'user'
  created_at: string
  avatar_url: string | null
}

export const authApi = {
  me: () => request<User>('/api/v1/auth/me'),
  login: (email: string, password: string) => request<User>('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  register: (email: string, display_name: string, password: string) =>
    request<User>('/api/v1/auth/register', {
      method: 'POST', body: JSON.stringify({ email, display_name, password }),
    }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  uploadAvatar(file: File): Promise<User> {
    const body = new FormData()
    body.append('file', file)
    return request('/api/v1/auth/me/avatar', { method: 'PUT', body })
  },
  deleteAvatar: () => request<User>('/api/v1/auth/me/avatar', { method: 'DELETE' }),
}
