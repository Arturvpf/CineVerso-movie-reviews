import { afterEach, expect, it, vi } from 'vitest'
import { request, SESSION_EXPIRED_EVENT } from './http'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('recupera CSRF pelo cabeçalho quando o cookie pertence ao host da API', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { headers: { 'X-CSRF-Token': 'from-api-host' } }))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await request('/api/v1/auth/me')
  await request('/api/v1/auth/me', { method: 'PATCH', body: '{}' })
  expect(fetcher.mock.calls[1][1].headers.get('X-CSRF-Token')).toBe('from-api-host')
  expect(fetcher.mock.calls[1][1].credentials).toBe('include')
  await request('/api/v1/auth/logout', { method: 'POST' })
  await request('/api/v1/auth/login', { method: 'POST', body: '{}' })
  expect(fetcher.mock.calls[3][1].headers.has('X-CSRF-Token')).toBe(false)
})

it('notifica expiração em 401 autenticado, mas não por senha incorreta', async () => {
  const expired = vi.fn()
  window.addEventListener(SESSION_EXPIRED_EVENT, expired)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(
    new Response(JSON.stringify({ detail: 'Sessão inválida.' }), { status: 401 }),
  )))
  try {
    await expect(request('/api/v1/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401 })
    expect(expired).not.toHaveBeenCalled()
    await expect(request('/api/v1/reviews/mine')).rejects.toMatchObject({ status: 401 })
    expect(expired).toHaveBeenCalledOnce()
  } finally { window.removeEventListener(SESSION_EXPIRED_EVENT, expired) }
})
