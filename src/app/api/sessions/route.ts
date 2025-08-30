import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// POST: Create a new session with a short code.
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const body = (await req.json().catch(() => ({}))) as { currency?: string; hostName?: string; hostEmail?: string }
    const currency = typeof body.currency === 'string' ? body.currency : null

    function genCode() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let s = ''
      for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
      return s
    }

    let code = genCode()
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase.from('sessions').select('id').eq('code', code).maybeSingle()
      if (!existing) break
      code = genCode()
    }

    // Create a host (anon for MVP) and attach to session
    const hostIns = await supabase
      .from('hosts')
      .insert({ name: body.hostName || null, email: body.hostEmail || null })
      .select('id')
      .single()
    if (hostIns.error) return NextResponse.json({ error: hostIns.error.message }, { status: 400 })
    const hostId = hostIns.data.id as string

    const { data, error } = await supabase
      .from('sessions')
      .insert({ code, currency, host_id: hostId })
      .select('id, code, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, session: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: list sessions (dev helper)
export async function GET() {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('sessions').select('id, code, created_at').order('created_at', { ascending: false }).limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, sessions: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
