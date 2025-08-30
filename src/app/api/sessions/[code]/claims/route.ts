import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// GET: list claims for a session code
export async function GET(_req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const { data: session, error: sErr } = await supabase.from('sessions').select('id').eq('code', code).maybeSingle()
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const { data, error } = await supabase
      .from('claims')
      .select('id, item_id, participant_id, share, created_at')
      .in('item_id', (await supabase.from('items').select('id').eq('session_id', session.id)).data?.map((r) => r.id) || [])
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, claims: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: toggle claim { itemId, participantId, share? }
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const { itemId, participantId, share } = (await req.json()) as { itemId: string; participantId: string; share?: number }

    const { data: session, error: sErr } = await supabase.from('sessions').select('id').eq('code', code).maybeSingle()
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    // Ensure the item belongs to the session
    const { data: item, error: iErr } = await supabase.from('items').select('id').eq('id', itemId).eq('session_id', session.id).maybeSingle()
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
    if (!item) return NextResponse.json({ error: 'Item not in session' }, { status: 400 })

    // Toggle claim
    const { data: existing, error: eErr } = await supabase.from('claims').select('id').eq('item_id', itemId).eq('participant_id', participantId).maybeSingle()
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
    if (existing) {
      const del = await supabase.from('claims').delete().eq('id', existing.id)
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })
      return NextResponse.json({ ok: true, toggled: 'removed' })
    }
    const ins = await supabase
      .from('claims')
      .insert({ item_id: itemId, participant_id: participantId, share: typeof share === 'number' ? share : 1.0 })
      .select('id')
      .single()
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    return NextResponse.json({ ok: true, toggled: 'added' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
