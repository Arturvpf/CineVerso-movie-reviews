import { useEffect, useState } from 'react'

export function draftKey(userId: string, form: 'movie' | 'new-review' | 'edit-review', id: string) {
  return `rocketlab:draft:v1:${userId}:${form}:${id}`
}

export function removeDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // O formulário continua funcionando se o armazenamento do navegador estiver indisponível.
  }
}

function readDraft<T extends Record<string, string | number>>(key: string, initial: T): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const values = parsed as Record<string, unknown>
    if (!Object.keys(initial).every((field) => typeof values[field] === typeof initial[field])) {
      return null
    }
    return { ...initial, ...values }
  } catch {
    return null
  }
}

export function useFormDraft<T extends Record<string, string | number>>(key: string, initial: T) {
  const [values, setValues] = useState<T>(() => readDraft(key, initial) ?? initial)
  const initialJson = JSON.stringify(initial)
  const hasDraft = JSON.stringify(values) !== initialJson

  useEffect(() => {
    try {
      if (JSON.stringify(values) === initialJson) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(values))
      }
    } catch {
      // O formulário continua funcionando se o armazenamento estiver indisponível.
    }
  }, [key, values, initialJson])

  function clearDraft() {
    removeDraft(key)
  }

  function discardDraft() {
    removeDraft(key)
    setValues(initial)
  }

  return { values, setValues, hasDraft, clearDraft, discardDraft }
}
