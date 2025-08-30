import { NextRequest, NextResponse } from 'next/server'

// POST: Compute totals (tax/tip distribution) for a given session payload.
// TODO: Implement server-side calculation once schema solidified.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
