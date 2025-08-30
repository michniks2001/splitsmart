export function getParticipantId(sessionCode: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(`splitsmart:participant:${sessionCode}`)
}

export function setParticipantId(sessionCode: string, id: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`splitsmart:participant:${sessionCode}`, id)
}

export function getParticipantName(sessionCode: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(`splitsmart:name:${sessionCode}`)
}

export function setParticipantName(sessionCode: string, name: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`splitsmart:name:${sessionCode}`, name)
}

export async function ensureParticipant(sessionCode: string, name?: string): Promise<string> {
  const existing = getParticipantId(sessionCode)
  if (existing) return existing
  const storedName = name ?? getParticipantName(sessionCode) ?? undefined
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/participants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: storedName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to join session')
  const id = data?.participant?.id as string
  if (!id) throw new Error('No participant id returned')
  setParticipantId(sessionCode, id)
  if (storedName) setParticipantName(sessionCode, storedName)
  return id
}
