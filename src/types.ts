// Shared types for SplitSmart AI

export type Session = { id: string; code: string; createdAt: string }
export type Participant = { id: string; name?: string; paid: boolean }
export type Item = { id: string; name: string; price_cents: number; tax_included?: boolean }
export type Claim = { id: string; item_id: string; participant_id: string; share: number }
export type Payment = { id: string; participant_id: string; amount_cents: number; status: 'pending' | 'paid' | 'failed' }
