export function useApi() {
  const base = window.location.origin

  return {
    get: async (path, params = {}) => {
      const url = new URL(base + path)
      Object.entries(params).forEach(([k, v]) => {
        if (v != null) url.searchParams.set(k, v)
      })
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(await res.text())
      return res
    },

    post: async (path, body = {}) => {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      return res
    },

    ws: (path, params = {}) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = new URL(proto + '//' + window.location.host + path)
      Object.entries(params).forEach(([k, v]) => {
        if (v != null) url.searchParams.set(k, v)
      })
      return new WebSocket(url.toString())
    }
  }
}
