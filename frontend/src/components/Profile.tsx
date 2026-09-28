import { useEffect, useState, type FormEvent } from 'react'
import { authApi, type User } from '../services/auth'
import { apiUrl } from '../services/http'
import { AvatarImage } from './AvatarImage'

export function Profile({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user.display_name)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const nextName = name.trim()
    if (!nextName) {
      setError('Informe um nome de exibição.')
      return
    }
    if (nextName === user.display_name) {
      setEditingName(false)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await authApi.updateProfile(nextName)
      onUpdated(updated)
      setName(updated.display_name)
      setEditingName(false)
      setNotice('Nome de exibição atualizado.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o nome.')
    } finally {
      setBusy(false)
    }
  }

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
        <AvatarImage key={image} src={image} name={user.display_name} />
      </div>
      <div className="profile-fields">
        <div className="profile-name-row">
          <strong>{user.display_name}</strong>
          {!editingName && <button type="button" className="secondary" disabled={busy}
            onClick={() => { setEditingName(true); setError(''); setNotice('') }}>Editar nome</button>}
        </div>
        {editingName && <form className="profile-name-form" onSubmit={saveName}>
          <label htmlFor="profile-display-name">Nome de exibição</label>
          <input id="profile-display-name" type="text" autoComplete="nickname"
            maxLength={120} value={name} disabled={busy}
            onChange={(event) => setName(event.target.value)} />
          <div className="profile-actions">
            <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => {
              setName(user.display_name); setEditingName(false); setError('')
            }}>Cancelar</button>
          </div>
        </form>}
        <span>{user.email}</span>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="success-notice" role="status">{notice}</p>}
        <label htmlFor="profile-photo">Foto de perfil (PNG, JPEG ou WebP; até 2 MB)</label>
        <input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp"
          disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} />
        <div className="profile-actions">
          <button type="button" disabled={!file || busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar foto'}</button>
          {user.avatar_url && <button type="button" className="secondary" disabled={busy} onClick={remove}>Remover foto</button>}
        </div>
      </div>
    </div>
  </section>
}
