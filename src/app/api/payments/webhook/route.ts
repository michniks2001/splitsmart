import { NextRequest, NextResponse } from 'next/server'

// POST: Flowglad webhook to confirm payments.
// TODO: Verify signatures and update payment + participant status.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
