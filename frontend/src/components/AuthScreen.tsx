import { useState } from 'react'
import type { FormEvent } from 'react'
import { authApi, type User } from '../services/auth'
import './AuthScreen.css'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const registering = mode === 'register'

  function changeMode(next: 'login' | 'register') {
    if (busy || next === mode) return
    setMode(next)
    setPassword('')
    setConfirmation('')
    setShowPassword(false)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (registering && password !== confirmation) {
      setError('As senhas não coincidem. Confira os dois campos.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const user = registering
        ? await authApi.register(email.trim(), name.trim(), password)
        : await authApi.login(email.trim(), password)
      onAuthenticated(user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível acessar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return <main id="main-content" className="auth-page">
    <section className="auth-story" aria-label="CineVerso">
      <div className="auth-story-art" aria-hidden="true">
        <div className="auth-story-orbit auth-story-orbit-one" />
        <div className="auth-story-orbit auth-story-orbit-two" />
        <span className="auth-story-star auth-story-star-one">✦</span>
        <span className="auth-story-star auth-story-star-two">✧</span>
        <div className="auth-story-frame"><span>C.</span></div>
      </div>
      <div className="auth-story-copy">
        <p className="auth-story-kicker">UM LUGAR PARA CADA HISTÓRIA</p>
        <h1>Seu próximo filme começa aqui.</h1>
        <p>Descubra tendências, monte sua lista e compartilhe o que achou de cada filme.</p>
      </div>
    </section>

    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-panel-inner">
        <p className="eyebrow">CINEVERSO</p>
        <h2 id="auth-title">{registering ? 'Crie sua conta' : 'Entre na sua conta'}</h2>
        <p className="auth-panel-intro">{registering
          ? 'Comece sua coleção de filmes em poucos passos.'
          : 'Que bom ter você de volta. Sua lista está esperando.'}</p>

        <div className="auth-mode-switch" role="group" aria-label="Acesso à conta">
          <button type="button" className={!registering ? 'active' : ''}
            aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>Entrar</button>
          <button type="button" className={registering ? 'active' : ''}
            aria-pressed={registering} disabled={busy} onClick={() => changeMode('register')}>Criar conta</button>
        </div>

        <form className="auth-form" aria-label={registering ? 'Cadastro' : 'Login'} onSubmit={submit}>
          {registering && <div className="auth-field">
            <label htmlFor="auth-name">Como podemos chamar você?</label>
            <input id="auth-name" type="text" autoComplete="name" value={name} maxLength={120}
              placeholder="Seu nome" required disabled={busy}
              onChange={(event) => setName(event.target.value)} />
          </div>}
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" autoComplete="email" value={email}
              placeholder="voce@exemplo.com" required disabled={busy}
              onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Senha</label>
            <div className="auth-password-field">
              <input id="auth-password" type={showPassword ? 'text' : 'password'}
                autoComplete={registering ? 'new-password' : 'current-password'}
                minLength={registering ? 12 : 1} maxLength={128} value={password}
                placeholder={registering ? 'Pelo menos 12 caracteres' : 'Sua senha'}
                required disabled={busy} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className="auth-password-toggle" disabled={busy}
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          {registering && <div className="auth-field">
            <label htmlFor="auth-confirmation">Confirme sua senha</label>
            <input id="auth-confirmation" type={showPassword ? 'text' : 'password'}
              autoComplete="new-password" minLength={12} maxLength={128} value={confirmation}
              placeholder="Digite a senha novamente" required disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)} />
            <p className="auth-field-hint">Use uma senha de pelo menos 12 caracteres.</p>
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : registering ? 'Criar minha conta' : 'Entrar'}
            {!busy && <span aria-hidden="true">↗</span>}
          </button>
        </form>
        <p className="auth-switch-prompt">{registering ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
          <button type="button" disabled={busy} onClick={() => changeMode(registering ? 'login' : 'register')}>
            {registering ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </div>
    </section>
  </main>
}
