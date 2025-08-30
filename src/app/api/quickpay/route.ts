import { NextRequest, NextResponse } from 'next/server'
import { flowgladServer } from '@/app/flowglad'
import { createClient } from '@/utils/supabase'

// Quickstart: initiate a basic one-time payment using a single price
// Visit: GET /api/quickpay -> redirects to Flowglad Checkout
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const origin = url.origin
    const code = url.searchParams.get('code') || undefined
    const participantId = url.searchParams.get('participantId') || undefined
    // For quickstart, go back to session page (if available) with a flag; no DB write needed
    const successUrl = code
      ? `${origin}/s/${encodeURIComponent(code)}?paid=1`
      : `${origin}/?paid=1`
    const cancelUrl = code
      ? `${origin}/s/${encodeURIComponent(code)}?cancelled=1`
      : `${origin}/?cancelled=1`

    const envPrice = process.env.FLOWGLAD_PRICE_ID || process.env.FLOWGLAD_CENTS_PRICE_ID
    const honchoDemo = process.env.HONCHO_DEMO === '1'
    const looksLikeProductId = !!envPrice && envPrice.startsWith('prod_')
    const useDemo = honchoDemo || !envPrice || looksLikeProductId

    // Demo fallback: if missing/invalid price or HONCHO_DEMO is on, skip Flowglad and simulate success
    if (useDemo) {
      // Best-effort: mark participant as paid in demo mode for realtime UX
      if (participantId) {
        try {
          const supabase = createClient()
          await supabase.from('participants').update({ paid: true }).eq('id', participantId)
        } catch {
          // ignore if supabase env not configured
        }
      }
      return NextResponse.redirect(successUrl)
    }

    // Ensure a customer exists (guest for MVP per flowglad.ts)
    await flowgladServer.findOrCreateCustomer()

    const session = await flowgladServer.createProductCheckoutSession({
      type: 'product',
      priceId: envPrice!,
      quantity: 1,
      successUrl,
      cancelUrl,
    })

    // Redirect the browser to hosted checkout
    return NextResponse.redirect(session.url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Optional: allow POST to behave the same
export const POST = GET
