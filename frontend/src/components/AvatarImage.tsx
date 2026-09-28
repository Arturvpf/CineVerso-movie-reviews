import { useState } from 'react'

export function AvatarImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return src && !failed
    ? <img src={src} alt="" onError={() => setFailed(true)} />
    : <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
}
