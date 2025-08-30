import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// GET: return host info for a session code
export async function GET(_req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const { data: session, error: sErr } = await supabase.from('sessions').select('id, host_id').eq('code', code).maybeSingle()
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (!session.host_id) return NextResponse.json({ ok: true, host: null })
    const { data: host, error: hErr } = await supabase.from('hosts').select('id, name, email').eq('id', session.host_id).maybeSingle()
    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, host: host ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: set or update host name/email for a session code
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const body = (await req.json().catch(() => ({}))) as { name?: string | null; email?: string | null }
    const name = typeof body.name === 'string' ? body.name : null
    const email = typeof body.email === 'string' ? body.email : null

    const { data: session, error: sErr } = await supabase.from('sessions').select('id, host_id').eq('code', code).maybeSingle()
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    let hostId = session.host_id as string | null
    if (hostId) {
      const upd = await supabase.from('hosts').update({ name, email }).eq('id', hostId).select('id, name, email').single()
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 })
      return NextResponse.json({ ok: true, host: upd.data })
    }

    const ins = await supabase.from('hosts').insert({ name, email }).select('id, name, email').single()
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    hostId = ins.data.id as string

    const link = await supabase.from('sessions').update({ host_id: hostId }).eq('id', session.id)
    if (link.error) return NextResponse.json({ error: link.error.message }, { status: 400 })

    return NextResponse.json({ ok: true, host: ins.data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
