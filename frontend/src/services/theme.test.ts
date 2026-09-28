import { afterEach, expect, it, vi } from 'vitest'
import { initialTheme, saveTheme } from './theme'

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

it('segue a preferência do sistema antes de uma escolha manual', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  expect(initialTheme()).toBe('dark')
})

it('mantém a escolha manual mesmo quando o sistema prefere outro tema', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  saveTheme('light')
  expect(initialTheme()).toBe('light')
})
