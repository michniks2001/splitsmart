'use client'

import { useEffect, useState } from 'react'

export default function HostNameEditor({ sessionCode }: { sessionCode: string }) {
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/host`)
        const data = await res.json()
        if (!cancelled && data?.ok) {
          const n = data?.host?.name ?? ''
          setName(n)
          setServerName(n)
        }
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [sessionCode])

  const save = async () => {
    if (!name || name === serverName) return
    setSaving(true)
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionCode)}/host`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok && data?.ok) {
        setServerName(data.host?.name ?? name)
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-600">Host name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
        placeholder="Add your name"
        className="px-2 py-1 rounded-md border text-sm bg-white dark:bg-zinc-900"
      />
      {saving && <span className="text-xs text-gray-500">Saving…</span>}
    </div>
  )
}
