export function ageDays(mtimeMs: number): number {
  const ageMs = Date.now() - mtimeMs
  return ageMs / (24 * 60 * 60 * 1000)
}

export function ageWarning(mtimeMs: number): string | null {
  const days = ageDays(mtimeMs)
  if (days < 1) return null
  const rounded = Math.round(days)
  if (rounded === 1) return 'This memory is 1 day old. Memories are point-in-time observations, not live state.'
  return `This memory is ${rounded} days old. Memories are point-in-time observations, not live state.`
}

export function formatAge(mtimeMs: number): string {
  const days = ageDays(mtimeMs)
  if (days < 1) {
    const hours = Math.round(days * 24)
    if (hours < 1) return 'just now'
    return `${hours}h ago`
  }
  if (days < 30) {
    const d = Math.round(days)
    return d === 1 ? '1 day ago' : `${d} days ago`
  }
  const months = Math.round(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}
