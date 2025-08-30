import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'
import { GoogleGenAI } from '@google/genai'

// GET: Recommend items to claim for a participant based on historical claims (name-based identity)
// Query: ?participantId=...  Optional: ?limit=...
export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const url = new URL(req.url)
    const participantId = url.searchParams.get('participantId')
    const limit = Math.min(200, Math.max(25, Number(url.searchParams.get('limit') || 100)))
    if (!participantId) return NextResponse.json({ error: 'participantId required' }, { status: 400 })

    // Resolve session and participant
    const sess = await supabase.from('sessions').select('id, code').eq('code', code).maybeSingle()
    if (sess.error) return NextResponse.json({ error: sess.error.message }, { status: 400 })
    if (!sess.data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const part = await supabase
      .from('participants')
      .select('id, name, session_id')
      .eq('id', participantId)
      .maybeSingle()
    if (part.error) return NextResponse.json({ error: part.error.message }, { status: 400 })
    if (!part.data) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

    // Current session items and existing claims (to avoid suggesting already-claimed)
    const itemsQ = await supabase
      .from('items')
      .select('id, name')
      .eq('session_id', sess.data.id)
    if (itemsQ.error) return NextResponse.json({ error: itemsQ.error.message }, { status: 400 })
    const currentItems = itemsQ.data || []

    const existingClaimsQ = await supabase
      .from('claims')
      .select('item_id, participant_id')
      .in('item_id', currentItems.map((i) => i.id))
    const existingClaims = existingClaimsQ.error ? [] : existingClaimsQ.data
    const alreadyClaimedByYou = new Set(
      existingClaims.filter((c) => c.participant_id === participantId).map((c) => c.item_id),
    )

    // Identity: use participant name to aggregate cross-session memory (MVP simplicity)
    const pname = (part.data.name || '').trim()
    if (!pname) {
      // If no name, we cannot safely aggregate; return empty suggestions for now
      return NextResponse.json({ ok: true, suggestions: [] })
    }

    const sameNameParts = await supabase
      .from('participants')
      .select('id')
      .ilike('name', pname)
    if (sameNameParts.error) return NextResponse.json({ error: sameNameParts.error.message }, { status: 400 })
    const pids = sameNameParts.data?.map((r) => r.id) || []
    if (pids.length === 0) return NextResponse.json({ ok: true, suggestions: [] })

    // Pull historical claims for these participants; join item names
    const history = await supabase
      .from('claims')
      .select('created_at, items(name)')
      .in('participant_id', pids)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (history.error) return NextResponse.json({ error: history.error.message }, { status: 400 })

    type Hist = { created_at: string; items: { name: string | null } | null }
    const freq = new Map<string, number>()
    const now = Date.now()
    for (const row of (history.data as unknown as Hist[])) {
      const nm = (row.items?.name || '').trim()
      if (!nm) continue
      // Recency-weighted score: 1.0 to 2.0 within ~30 days
      const ageDays = Math.max(0, (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const weight = Math.max(1, 2 - ageDays / 30)
      freq.set(nm.toLowerCase(), (freq.get(nm.toLowerCase()) || 0) + weight)
    }

    // If Gemini key exists, ask model to pick best matches among current items using historical favorites
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey })
        const favorites = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50)
          .map(([name, score]) => ({ name, score }))
        const prompt = [
          'You are helping match a diner\'s usual orders to items on the current receipt.',
          'Given the list of current receipt item names and the diner\'s historical favorites with scores,',
          'return up to 10 current item names you recommend for this diner, as a JSON array of strings,',
          'with exact matches to receipt item names when possible. Do not include items already claimed.',
          '',
          `Current items: ${JSON.stringify(currentItems.map((i) => i.name))}`,
          `Already claimed item IDs: ${JSON.stringify(Array.from(alreadyClaimedByYou))}`,
          `Historical favorites: ${JSON.stringify(favorites)}`,
          'Output strictly JSON array of strings, nothing else.',
        ].join('\n')

        const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ text: prompt }] })

        // Typed text extraction compatible with parse-receipt
        type Part = { text?: string }
        type Candidate = { content?: { parts?: Part[] } }
        type GenResponse = {
          response?: {
            text?: () => string
            candidates?: Candidate[]
          }
          text?: string | (() => string)
          output_text?: string
        }
        function getText(respObj: unknown): string {
          try {
            const r = respObj as GenResponse
            if (r?.response?.text && typeof r.response.text === 'function') return r.response.text()
            if (r?.text && typeof r.text === 'function') return r.text()
            if (typeof r?.text === 'string') return r.text
            if (typeof r?.output_text === 'string') return r.output_text
            const cand = r?.response?.candidates?.[0]
            const parts = cand?.content?.parts
            if (Array.isArray(parts)) {
              const t = parts.map((p: Part) => p?.text ?? '').filter(Boolean).join('\n')
              if (t) return t
            }
          } catch {
            // ignore
          }
          return ''
        }
        const cleaned = getText(resp).trim()
        let names: string[] = []
        try {
          names = JSON.parse(cleaned)
        } catch {
          const m = cleaned.match(/\[[\s\S]*\]/)
          if (m) names = JSON.parse(m[0])
        }
        if (Array.isArray(names)) {
          const lowerToId = new Map<string, string>()
          for (const it of currentItems) lowerToId.set((it.name || '').toLowerCase(), it.id)
          const ids: string[] = []
          for (const n of names) {
            const key = (String(n) || '').toLowerCase()
            const id = lowerToId.get(key)
            if (id && !alreadyClaimedByYou.has(id)) ids.push(id)
            if (ids.length >= 10) break
          }
          return NextResponse.json({ ok: true, modelTried: 'gemini', suggestions: ids })
        }
      } catch {
        // fall through to heuristic
      }
    }

    // Heuristic match: current items vs historical favorites by exact lowercased name
    const scored: Array<{ id: string; name: string; score: number }> = []
    for (const it of currentItems) {
      const key = (it.name || '').toLowerCase()
      const score = freq.get(key) || 0
      if (score > 0 && !alreadyClaimedByYou.has(it.id)) {
        scored.push({ id: it.id, name: it.name || '', score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    const suggestedIds = scored.slice(0, 10).map((s) => s.id)
    return NextResponse.json({ ok: true, modelTried: 'heuristic', suggestions: suggestedIds })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
