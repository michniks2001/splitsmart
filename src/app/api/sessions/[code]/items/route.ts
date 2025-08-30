import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// GET: return session (by code) and its items
export async function GET(_req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('id, code, subtotal_cents, tax_cents, tip_cents, total_cents, currency')
      .eq('code', code)
      .maybeSingle()
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const { data: items, error: iErr } = await supabase
      .from('items')
      .select('id, name, quantity, unit_price_cents, total_cents, tax_included')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, session, items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: replace items for session by code using parsed receipt payload
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    type Parsed = {
      items: Array<{ name: string; quantity: number; unitPrice: number; total: number; tax_included?: boolean }>
      subtotal: number
      tax: number
      tip: number
      total: number
      currency?: string
    }
    const body = (await req.json()) as Parsed
    const sel = await supabase.from('sessions').select('id').eq('code', code).maybeSingle()
    if (sel.error) return NextResponse.json({ error: sel.error.message }, { status: 400 })
    let session = sel.data
    if (!session) {
      const ins = await supabase.from('sessions').insert({ code, currency: body.currency || null }).select('id').single()
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      session = ins.data
    }

    const toCents = (n: number) => Math.round((n || 0) * 100)

    // Replace items: delete old and insert new
    const del = await supabase.from('items').delete().eq('session_id', session.id)
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })

    if (Array.isArray(body.items) && body.items.length > 0) {
      const rows = body.items.map((it) => ({
        session_id: session.id,
        name: it.name,
        quantity: it.quantity ?? 1,
        unit_price_cents: toCents(it.unitPrice ?? 0),
        total_cents: toCents(it.total ?? (it.quantity ?? 1) * (it.unitPrice ?? 0)),
        tax_included: !!it.tax_included,
      }))
      const insItems = await supabase.from('items').insert(rows).select('id')
      if (insItems.error) return NextResponse.json({ error: insItems.error.message }, { status: 400 })
    }

    // Update session totals
    const upd = await supabase
      .from('sessions')
      .update({
        subtotal_cents: toCents(body.subtotal || 0),
        tax_cents: toCents(body.tax || 0),
        tip_cents: toCents(body.tip || 0),
        total_cents: toCents(body.total || 0),
        currency: body.currency || null,
      })
      .eq('id', session.id)
      .select('id, code, subtotal_cents, tax_cents, tip_cents, total_cents, currency')
      .single()
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 })

    return NextResponse.json({ ok: true, session: upd.data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
