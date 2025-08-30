// Lightweight Honcho-like client for experimentation only.
// Uses localStorage in the browser; on the server falls back to an in-memory store.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

interface HonchoClient {
  set<T = unknown>(key: string, value: T): void
  get<T = unknown>(key: string): T | null
  clear(prefix?: string): void
  track(event: string, data?: Record<string, unknown>): void
}

const SERVER_STORE_SYMBOL = Symbol.for('splitsmart.honcho.serverStore')
function getServerStore(): Map<string, string> {
  const g = globalThis as unknown as Record<string | symbol, unknown>
  if (!g[SERVER_STORE_SYMBOL]) {
    g[SERVER_STORE_SYMBOL] = new Map<string, string>()
  }
  return g[SERVER_STORE_SYMBOL] as Map<string, string>
}

export function getHonchoClient(): HonchoClient {
  const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  const ns = 'honcho:'

  const set = <T = unknown>(key: string, value: T) => {
    const payload = JSON.stringify(value)
    if (isBrowser) {
      window.localStorage.setItem(ns + key, payload)
    } else {
      getServerStore().set(ns + key, payload)
    }
  }

  const get = <T = unknown>(key: string): T | null => {
    let payload: string | null = null
    if (isBrowser) {
      payload = window.localStorage.getItem(ns + key)
    } else {
      payload = getServerStore().get(ns + key) ?? null
    }
    if (payload == null) return null
    try {
      return JSON.parse(payload) as T
    } catch {
      return null
    }
  }

  const clear = (prefix?: string) => {
    if (isBrowser) {
      const keys = Object.keys(window.localStorage)
      for (const k of keys) {
        if (k.startsWith(ns) && (!prefix || k.startsWith(ns + prefix))) {
          window.localStorage.removeItem(k)
        }
      }
    } else {
      const store = getServerStore()
      for (const k of Array.from(store.keys())) {
        if (k.startsWith(ns) && (!prefix || k.startsWith(ns + prefix))) {
          store.delete(k)
        }
      }
    }
  }

  const track = (event: string): void => {
    // Simple console logger for experimentation.
    try {
      // Keep a rolling log in storage too.
      const logs = (get<Json[]>('logs') || []) as Json[]
      const entry: { [k: string]: Json } = { ts: Date.now(), event }
      logs.push(entry)
      set('logs', logs as Json)
    } catch {
      // ignore
    }
    console.log('[honcho]', event)
  }

  return { set, get, clear, track }
}
