'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase'
import { ensureParticipant, getParticipantName } from '@/utils/participant'
import { useSearchParams } from 'next/navigation'
import { getHonchoClient } from '@/utils/honcho'

export default function SessionView({ sessionCode }: { sessionCode: string }) {
  type SessionRow = { id: string; code: string; subtotal_cents: number; tax_cents: number; tip_cents: number; total_cents: number; currency?: string | null }
  type ItemRow = { id: string; name: string; quantity: number; unit_price_cents: number; total_cents: number; tax_included: boolean }
  type ClaimRow = { id: string; item_id: string; participant_id: string; share: number }
  type ParticipantRow = { id: string; session_id: string; name: string | null; paid: boolean; created_at: string }

  const [session, setSession] = useState<SessionRow | null>(null)
  const [items, setItems] = useState<ItemRow[]>([])
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [isPaying, setIsPaying] = useState(false)
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [displayName, setDisplayName] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const paidFlag = searchParams?.get('paid') === '1'
  const honcho = useMemo(() => getHonchoClient(), [])
  const [suggestedIds, setSuggestedIds] = useState<string[]>([])
  const [localSuggestedIds, setLocalSuggestedIds] = useState<string[]>([])
  const [serverSuggestedIds, setServerSuggestedIds] = useState<string[]>([])

  // Stable keys for dependency arrays
  const itemsKey = useMemo(() => items.map((i) => i.id).join(','), [items])
  const claimsCount = claims.length

  // Join or ensure participant
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = await ensureParticipant(sessionCode)
        if (!cancelled) setParticipantId(id)
      } catch {
        // ignore for now
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionCode])

  // Load stored display name
  useEffect(() => {
    setDisplayName(getParticipantName(sessionCode))
  }, [sessionCode])

  // Persist last claimed item names for this participant (for suggestions)
  useEffect(() => {
    if (!participantId) return
    try {
      const nameSet = new Set<string>()
      for (const c of claims) {
        if (c.participant_id !== participantId) continue
        const it = items.find((i) => i.id === c.item_id)
        if (it?.name) nameSet.add(it.name)
      }
      honcho.set(`session:${sessionCode}:lastClaimedNames`, Array.from(nameSet))
    } catch {
      // ignore
    }
  }, [claims, items, participantId, sessionCode, honcho])

  // Load session + items + claims
  const loadAll = async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/items`).then((r) => r.json()),
      fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/claims`).then((r) => r.json()),
    ])
    if (a?.ok) {
      setSession(a.session)
      setItems(Array.isArray(a.items) ? a.items : [])
    }
    if (b?.ok) setClaims(Array.isArray(b.claims) ? b.claims : [])
  }

  const loadParticipants = async () => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/participants`)
    const data = await res.json()
    if (data?.ok && Array.isArray(data.participants)) setParticipants(data.participants as ParticipantRow[])
  }

  useEffect(() => {
    loadAll()
    loadParticipants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode])

  // Realtime subscriptions
  useEffect(() => {
    if (!session) return
    const supabase = createClient()
    const channel = supabase.channel(`session-${session.id}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `session_id=eq.${session.id}` },
      () => {
        loadAll()
      },
    )
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'claims' },
      (payload: { new: { item_id?: string } | null; old: { item_id?: string } | null }) => {
        const itemIds = new Set(items.map((it) => it.id))
        // Only react if claim is for one of our items
        const rec = payload.new ?? payload.old
        if (rec && rec.item_id && itemIds.has(rec.item_id)) {
          loadAll()
        }
      },
    )
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${session.id}` },
      () => {
        loadParticipants()
      },
    )
    channel.subscribe()
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // noop
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, items.map((i) => i.id).join(',')])

  // Build suggestions from previously claimed item names (local Honcho memory)
  useEffect(() => {
    try {
      const prev = (honcho.get<string[]>(`session:${sessionCode}:lastClaimedNames`) || []) as string[]
      if (!prev.length) {
        setLocalSuggestedIds([])
        return
      }
      const lowerPrev = new Set(prev.map((n) => (n || '').toLowerCase()))
      const candidateIds = items
        .filter((it) => lowerPrev.has((it.name || '').toLowerCase()))
        .map((it) => it.id)
      const claimedByMe = new Set(
        claims.filter((c) => c.participant_id === participantId).map((c) => c.item_id),
      )
      const final = candidateIds.filter((id) => !claimedByMe.has(id))
      setLocalSuggestedIds(final)
    } catch {
      setLocalSuggestedIds([])
    }
  }, [items, claims, participantId, sessionCode, honcho])

  // Fetch server-side suggestions based on historical claims across sessions (AI-like memory)
  useEffect(() => {
    if (!participantId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionCode)}/suggestions?participantId=${encodeURIComponent(participantId)}`,
        )
        const data = await res.json()
        if (!cancelled && data?.ok) {
          const arr = Array.isArray(data.suggestions) ? (data.suggestions as string[]) : []
          setServerSuggestedIds(arr)
        }
      } catch {
        if (!cancelled) setServerSuggestedIds([])
      }
    })()
    return () => {
      cancelled = true
    }
    // re-evaluate when items set changes (names/ids) or your claims change
  }, [sessionCode, participantId, itemsKey, claimsCount])

  // Merge local and server suggestions, remove duplicates and already-claimed
  useEffect(() => {
    const union = new Set<string>([...localSuggestedIds, ...serverSuggestedIds])
    const claimedByMe = new Set(claims.filter((c) => c.participant_id === participantId).map((c) => c.item_id))
    const final = Array.from(union).filter((id) => !claimedByMe.has(id))
    setSuggestedIds(final)
  }, [localSuggestedIds, serverSuggestedIds, claims, participantId])

  const toggleClaim = async (itemId: string) => {
    if (!participantId) return
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/claims`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, participantId }),
      })
      // Optimistic: update locally
      setClaims((prev) => {
        const exists = prev.find((c) => c.item_id === itemId && c.participant_id === participantId)
        if (exists) return prev.filter((c) => c !== exists)
        return [...prev, { id: `tmp-${Date.now()}`, item_id: itemId, participant_id: participantId, share: 1 }]
      })
    } catch {
      // ignore
    }
  }

  const applySuggestions = async () => {
    if (!participantId || !suggestedIds.length) return
    for (const id of suggestedIds) {
      // sequential to keep optimistic UI smooth
      await toggleClaim(id)
    }
  }

  const yourItemsTotalCents = useMemo(() => {
    if (!items.length) return 0
    let sum = 0
    for (const it of items) {
      const cs = claims.filter((c) => c.item_id === it.id)
      if (!cs.length) continue
      const totalShares = cs.reduce((s, c) => s + (typeof c.share === 'number' ? c.share : 1), 0)
      const my = cs.find((c) => c.participant_id === participantId)
      if (!my || totalShares <= 0) continue
      const myShare = typeof my.share === 'number' ? my.share : 1
      sum += Math.round((it.total_cents * myShare) / totalShares)
    }
    return sum
  }, [items, claims, participantId])

  const allocatedTaxCents = useMemo(() => {
    if (!session) return 0
    const base = session.subtotal_cents || 0
    if (base <= 0) return 0
    return Math.round((yourItemsTotalCents / base) * (session.tax_cents || 0))
  }, [session, yourItemsTotalCents])

  const allocatedTipCents = useMemo(() => {
    if (!session) return 0
    const base = session.subtotal_cents || 0
    if (base <= 0) return 0
    return Math.round((yourItemsTotalCents / base) * (session.tip_cents || 0))
  }, [session, yourItemsTotalCents])

  const yourTotalCents = yourItemsTotalCents + allocatedTaxCents + allocatedTipCents

  const normalizeCurrency = (c?: string | null) => {
    if (!c) return 'USD'
    const t = c.trim().toUpperCase()
    if (t === '$') return 'USD'
    if (t === '€') return 'EUR'
    if (t === '£') return 'GBP'
    if (/^[A-Z]{3}$/.test(t)) return t
    return 'USD'
  }
  const currency = normalizeCurrency(session?.currency || 'USD')
  const fmt = (cents: number) => {
    const val = Math.max(0, (cents || 0) / 100)
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(val)
    } catch {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(val)
    }
  }

  const startCheckout = async () => {
    if (!participantId) return
    setIsPaying(true)
    try {
      try {
        honcho.set(`session:${sessionCode}:lastTotalCents`, yourTotalCents)
        honcho.track('checkout.start')
      } catch {
        // ignore
      }
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participantId }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        // Basic UX for MVP
        alert(data?.error || 'Failed to start checkout')
        setIsPaying(false)
        return
      }
      window.location.href = data.url as string
    } catch (e) {
      console.error(e)
      alert('Failed to start checkout')
      setIsPaying(false)
    }
  }

  if (!session || !items.length) {
    return (
      <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm p-6 text-center">
        {paidFlag && (
          <div className="mb-2 rounded-md bg-green-50 text-green-800 border border-green-200 px-3 py-2 text-sm">
            Payment successful! Thanks {displayName ? displayName : 'guest'}.
          </div>
        )}
        <p className="text-sm text-gray-600">Upload a receipt to start claiming items.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {paidFlag && (
        <div className="rounded-md bg-green-50 text-green-800 border border-green-200 px-3 py-2 text-sm">
          Payment successful! Thanks {displayName ? displayName : 'guest'}.
        </div>
      )}

      {suggestedIds.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm p-4">
          <div className="text-sm flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Suggestion</div>
              <div className="text-gray-600">Claim your usual items from previous receipts</div>
            </div>
            <button
              onClick={applySuggestions}
              className="rounded-md bg-black text-white px-3 py-1.5 text-sm dark:bg-white dark:text-black"
            >
              Claim suggestions ({suggestedIds.length})
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-4 py-3 border-b text-sm font-medium text-gray-700 flex items-center justify-between">
          <span>Participants</span>
          {displayName && <span className="text-xs text-gray-500">You are {displayName}</span>}
        </div>
        <ul className="divide-y">
          {participants.map((p) => {
            const isYou = p.id === participantId
            return (
              <li key={p.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full ${p.paid ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="truncate">{p.name || 'Guest'}</span>
                  {isYou && <span className="text-xs text-gray-500">(you)</span>}
                </div>
                {p.paid && <span className="text-xs text-green-600">paid</span>}
              </li>
            )
          })}
          {participants.length === 0 && (
            <li className="px-4 py-2 text-xs text-gray-500">No participants yet</li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-4 py-3 border-b text-sm font-medium text-gray-700">Items</div>
        <ul className="divide-y">
          {items.map((it) => {
            const checked = !!claims.find((c) => c.item_id === it.id && c.participant_id === participantId)
            return (
              <li key={it.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.name}</div>
                  <div className="text-xs text-gray-600">qty {it.quantity} • unit {fmt(it.unit_price_cents)} • total {fmt(it.total_cents)}</div>
                  {claims.some((c) => c.item_id === it.id) && (
                    <div className="mt-1 text-xs text-gray-600">
                      Claimed by:{' '}
                      {claims
                        .filter((c) => c.item_id === it.id)
                        .map((c) => {
                          const p = participants.find((pp) => pp.id === c.participant_id)
                          const isYou = c.participant_id === participantId
                          const label = `${p?.name || 'Guest'}${isYou ? ' (you)' : ''}`
                          return label
                        })
                        .join(', ')}
                    </div>
                  )}
                </div>
                <label className="text-sm inline-flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleClaim(it.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Claim
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Your items</span><span>{fmt(yourItemsTotalCents)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Allocated tax</span><span>{fmt(allocatedTaxCents)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Allocated tip</span><span>{fmt(allocatedTipCents)}</span></div>
          <div className="flex justify-between font-medium border-t pt-2 mt-1"><span>Your total</span><span>{fmt(yourTotalCents)}</span></div>
        </div>
        <button
          onClick={startCheckout}
          disabled={isPaying || !participantId || yourTotalCents <= 0}
          className="mt-3 w-full rounded-md bg-black text-white py-2 text-sm font-medium disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isPaying ? 'Redirecting…' : `Pay ${fmt(yourTotalCents)}`}
        </button>
      </div>
    </div>
  )
}
