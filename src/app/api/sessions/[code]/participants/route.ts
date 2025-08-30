import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// POST: Join a session by code; create participant (anon allowed).
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { name } = (await req.json().catch(() => ({}))) as { name?: string }
    const { code } = await context.params

    // Ensure session exists
    const sel = await supabase.from('sessions').select('id, code').eq('code', code).maybeSingle()
    if (sel.error) return NextResponse.json({ error: sel.error.message }, { status: 400 })
    let session = sel.data
    if (!session) {
      // Auto-create a host and session when joining a non-existent code (MVP convenience)
      const hostIns = await supabase.from('hosts').insert({}).select('id').single()
      if (hostIns.error) return NextResponse.json({ error: hostIns.error.message }, { status: 400 })
      const hostId = hostIns.data.id as string
      const ins = await supabase.from('sessions').insert({ code, host_id: hostId }).select('id, code').single()
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      session = ins.data
    }

    const { data, error } = await supabase
      .from('participants')
      .insert({ session_id: session.id, name: name || null })
      .select('id, session_id, name, paid, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, participant: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: List participants for a session code
export async function GET(_req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const supabase = createClient()
    const { code } = await context.params
    const sel = await supabase.from('sessions').select('id').eq('code', code).maybeSingle()
    if (sel.error) return NextResponse.json({ error: sel.error.message }, { status: 400 })
    if (!sel.data) return NextResponse.json({ ok: true, participants: [] })
    const { data, error } = await supabase
      .from('participants')
      .select('id, session_id, name, paid, created_at')
      .eq('session_id', sel.data.id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, participants: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
