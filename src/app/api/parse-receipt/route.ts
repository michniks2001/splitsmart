import { NextRequest, NextResponse } from 'next/server'

import { GoogleGenAI } from '@google/genai'

// POST: Accept multipart or JSON body with an image, call Gemini to parse the receipt.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      // Demo fallback: return a mocked parsed receipt so MVP works without credentials
      const demo = {
        items: [
          { name: 'Burger', quantity: 1, unitPrice: 9.99, total: 9.99 },
          { name: 'Fries', quantity: 1, unitPrice: 3.49, total: 3.49 },
          { name: 'Soda', quantity: 1, unitPrice: 2.5, total: 2.5 },
        ],
        subtotal: 15.98,
        tax: 1.28,
        tip: 2.0,
        total: 19.26,
        currency: 'USD',
      }
      return NextResponse.json({ ok: true, modelTried: 'demo', result: demo })
    }

    const contentType = req.headers.get('content-type') || ''
    let base64: string | undefined
    let mimeType: string | undefined

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
      const buf = Buffer.from(await file.arrayBuffer())
      base64 = buf.toString('base64')
      mimeType = file.type || 'image/jpeg'
    } else if (contentType.includes('application/json')) {
      type JsonBody = { dataUrl?: string; imageBase64?: string; mimeType?: string }
      const raw: unknown = await req.json().catch(() => null)
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      const body = raw as JsonBody
      if (typeof body.dataUrl === 'string') {
        const match = body.dataUrl.match(/^data:(.*?);base64,(.*)$/)
        if (!match) return NextResponse.json({ error: 'Invalid dataUrl' }, { status: 400 })
        mimeType = match[1]
        base64 = match[2]
      } else if (typeof body.imageBase64 === 'string' && typeof body.mimeType === 'string') {
        base64 = body.imageBase64
        mimeType = body.mimeType
      }
    }

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro'
    const fallbackModel = 'gemini-2.5-flash'
    const ai = new GoogleGenAI({ apiKey })

    const prompt = `You are parsing a restaurant receipt. Extract a strict JSON object with this schema:
{
  "items": [
    {"name": string, "quantity": number, "unitPrice": number, "total": number}
  ],
  "subtotal": number,
  "tax": number,
  "tip": number,
  "total": number,
  "currency": string
}
Rules:
- Return ONLY valid JSON. No markdown fences. No commentary.
- If something is missing, use 0 for numbers and omit unknown optional fields.
- Ensure items totals and sum relationships are consistent: subtotal + tax + tip = total.
`

    const parts = [
      { text: prompt },
      {
        inlineData: {
          data: base64,
          mimeType,
        },
      },
    ]

    async function run(m: string) {
      const res = await ai.models.generateContent({
        model: m,
        contents: parts,
      })
      return res
    }

    type Part = { text?: string }
    type Candidate = { content?: { parts?: Part[] } }
    type GenResponse = {
      response?: {
        text?: () => string
        candidates?: Candidate[]
      }
      text?: string | (() => string)
      output_text?: string
    }

    async function getText(resp: unknown): Promise<string> {
      try {
        const anyResp = resp as GenResponse
        // New SDK shape: result.response.text()
        if (anyResp?.response?.text && typeof anyResp.response.text === 'function') {
          return anyResp.response.text()
        }
        // Older shape: result.text() or result.text
        if (anyResp?.text && typeof anyResp.text === 'function') {
          return anyResp.text()
        }
        if (typeof anyResp?.text === 'string') {
          return anyResp.text
        }
        // Some builds expose output_text
        if (typeof anyResp?.output_text === 'string') {
          return anyResp.output_text
        }
        // Candidates/content fallback
        const cand = anyResp?.response?.candidates?.[0]
        const parts = cand?.content?.parts
        if (Array.isArray(parts)) {
          const t = parts.map((p: Part) => p?.text ?? '').filter(Boolean).join('\n')
          if (t) return t
        }
      } catch {
        // ignore
      }
      return ''
    }

    let resp: unknown
    let modelUsed = model
    try {
      resp = await run(model)
    } catch {
      // Fallback to a faster/cheaper model
      resp = await run(fallbackModel)
      modelUsed = fallbackModel
    }

    const rawText = await getText(resp)
    const text = typeof rawText === 'string' ? rawText : ''
    try {
      // Strip code fences if present
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
      const body = fenced ? fenced[1] : text
      try {
        const parsed = JSON.parse(body)
        return NextResponse.json({ ok: true, modelTried: modelUsed, result: parsed })
      } catch {
        // Fallback: attempt to extract the first JSON object substring
        const start = body.indexOf('{')
        const end = body.lastIndexOf('}')
        if (start >= 0 && end > start) {
          const slice = body.slice(start, end + 1)
          const parsed = JSON.parse(slice)
          return NextResponse.json({ ok: true, modelTried: modelUsed, result: parsed })
        }
        throw new Error('no-json')
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Model did not return parseable JSON', raw: text },
        { status: 422 },
      )
    }
  } catch (err: unknown) {
    const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
