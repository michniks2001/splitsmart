'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getHonchoClient } from '@/utils/honcho'

type ParseResult = {
  ok: boolean
  modelTried?: string
  result?: unknown
  error?: string
  raw?: string
}

export default function ReceiptUploader({ sessionCode }: { sessionCode?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // No longer rendering raw result JSON on screen
  const [dragActive, setDragActive] = useState(false)

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreviewUrl(url)
  }, [])

  const reset = useCallback(() => {
    setFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [previewUrl])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(f)
    setPreviewUrl(url)
  }, [previewUrl])

  const onSubmit = useCallback(async () => {
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/parse-receipt', { method: 'POST', body: fd })
      const data: ParseResult = await res.json()
      if (data && data.ok && sessionCode) {
        const client = getHonchoClient()
        client.set(`session:${sessionCode}:receipt`, data.result as unknown as object)
        client.track('receipt.parsed')

        // Persist to Supabase session items
        try {
          await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data.result ?? {}),
          })
          // After successfully posting items, clear the local selection so UI flows to claiming
          reset()
        } catch {
          // ignore; SessionView will still work with local view
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      // Optionally log; UI no longer shows raw JSON
      console.error('Parse failed:', msg)
    } finally {
      setLoading(false)
    }
  }, [file, sessionCode, reset])

  // Auto-parse once per selected file
  const autoSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!file) return
    const sig = `${file.name}:${file.size}:${file.lastModified}`
    if (autoSigRef.current === sig) return
    autoSigRef.current = sig
    let cancelled = false
    const t = setTimeout(() => {
      if (!cancelled) onSubmit()
    }, 50)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  return (
    <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm p-4">
      <div
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${dragActive ? 'border-black/70 bg-black/[.03] dark:border-white/70 dark:bg-white/5' : 'border-zinc-300/80 dark:border-zinc-700/60'}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          className="hidden"
        />
        <p className="text-sm text-gray-600">Drag and drop a receipt image here</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Choose file
          </button>
          <button
            type="button"
            disabled={!file || loading}
            onClick={onSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? 'Parsing…' : 'Parse receipt'}
          </button>
          {file && (
            <button type="button" onClick={reset} className="text-sm text-gray-600 hover:underline">Reset</button>
          )}
        </div>
        {file && (
          <p className="mt-2 text-xs text-gray-500">Selected: {file.name}</p>
        )}
      </div>

      {previewUrl && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Receipt preview" className="max-w-xs rounded-lg border shadow-sm" />
        </div>
      )}

      {/* Raw JSON preview removed: after parse we immediately post items so participants can claim */}
    </div>
  )
}

