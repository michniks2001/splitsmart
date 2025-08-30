import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase'

// GET: redirect target after successful Flowglad checkout
// Query: ?code=SESSION_CODE&payment_id=PAYMENT_ID
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const paymentId = url.searchParams.get('payment_id')
    if (!code || !paymentId) return NextResponse.json({ error: 'Missing code or payment_id' }, { status: 400 })

    const supabase = createClient()

    // Load payment + participant + amount and host
    const p = await supabase
      .from('payments')
      .select('id, participant_id, session_id, status, amount_cents, host_id')
      .eq('id', paymentId)
      .maybeSingle()
    if (p.error) return NextResponse.json({ error: p.error.message }, { status: 400 })
    const payment = p.data
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    // Mark payment as paid (idempotent)
    if (payment.status !== 'paid') {
      const upd = await supabase.from('payments').update({ status: 'paid' }).eq('id', payment.id)
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 })

      // Also mark participant as paid for MVP UX
      if (payment.participant_id) {
        // best-effort; ignore errors
        await supabase.from('participants').update({ paid: true }).eq('id', payment.participant_id)
      }
    }

    // Idempotent host ledger credit on successful payment
    if (payment.host_id && (payment.amount_cents || 0) > 0) {
      const existing = await supabase
        .from('host_ledger_entries')
        .select('id')
        .eq('payment_id', payment.id)
        .eq('type', 'host_credit')
        .maybeSingle()
      if (!existing.data) {
        await supabase.from('host_ledger_entries').insert({
          host_id: payment.host_id,
          type: 'host_credit',
          amount_cents: payment.amount_cents,
          payment_id: payment.id,
          notes: 'SplitSmart payment credit',
        })
      }
    }

    // Redirect back to the session page
    const dest = `${url.origin}/s/${encodeURIComponent(code)}?paid=1`
    return NextResponse.redirect(dest)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
