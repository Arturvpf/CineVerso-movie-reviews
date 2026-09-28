export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cineverso-theme'

export function savedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function initialTheme(): Theme {
  return savedTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // A troca de tema continua funcionando se o navegador bloquear o armazenamento.
  }
}
