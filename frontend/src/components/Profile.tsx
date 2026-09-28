import { useEffect, useState } from 'react'
import { authApi, type User } from '../services/auth'
import { apiUrl } from '../services/http'

export function Profile({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function selectFile(next: File | undefined) {
    setError('')
    setNotice('')
    if (!next) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) {
      setFile(null)
      setPreview(null)
      setError('Escolha uma imagem PNG, JPEG ou WebP.')
      return
    }
    if (next.size > 2 * 1024 * 1024) {
      setFile(null)
      setPreview(null)
      setError('A foto deve ter no máximo 2 MB.')
      return
    }
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  async function save() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      onUpdated(await authApi.uploadAvatar(file))
      setFile(null)
      setPreview(null)
      setNotice('Foto de perfil atualizada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a foto.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onUpdated(await authApi.deleteAvatar())
      setFile(null)
      setPreview(null)
      setNotice('Foto de perfil removida.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a foto.')
    } finally {
      setBusy(false)
    }
  }

  const image = preview || (user.avatar_url ? apiUrl(user.avatar_url) : null)
  return <section className="profile-panel" aria-labelledby="profile-title">
    <p className="eyebrow">SUA CONTA</p>
    <h2 id="profile-title">Meu perfil</h2>
    <div className="profile-content">
      <div className="profile-avatar" aria-label={`Foto de ${user.display_name}`}>
        {image ? <img src={image} alt="" /> : <span aria-hidden="true">{user.display_name.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="profile-fields">
        <strong>{user.display_name}</strong>
        <span>{user.email}</span>
        <label htmlFor="profile-photo">Foto de perfil (PNG, JPEG ou WebP; até 2 MB)</label>
        <input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp"
          disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} />
        <div className="profile-actions">
          <button type="button" disabled={!file || busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar foto'}</button>
          {user.avatar_url && <button type="button" className="secondary" disabled={busy} onClick={remove}>Remover foto</button>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="success-notice" role="status">{notice}</p>}
      </div>
    </div>
  </section>
}
