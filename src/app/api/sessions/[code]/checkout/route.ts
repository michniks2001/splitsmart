import { NextRequest, NextResponse } from 'next/server'

// POST: create a Flowglad checkout session for a participant's owed amount
// Body: { participantId: string }
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params // ensure dynamic params are awaited (Next.js 15)
    const { participantId } = (await req.json()) as { participantId: string }
    if (!participantId) return NextResponse.json({ error: 'participantId is required' }, { status: 400 })

    // Quickstart shortcut: delegate to /api/quickpay which creates a basic checkout session
    const quickOrigin = new URL(req.url).origin
    const qp = new URL(`${quickOrigin}/api/quickpay`)
    qp.searchParams.set('code', code)
    qp.searchParams.set('participantId', participantId)
    return NextResponse.json({ ok: true, url: qp.toString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
