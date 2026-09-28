const moviePath = /^\/filmes\/([^/]+)\/?$/

export function movieIdFromPath(pathname: string): string | null {
  const match = moviePath.exec(pathname)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function pathForMovie(movieId: string): string {
  return `/filmes/${encodeURIComponent(movieId)}`
}
