'use client'

import { useState } from 'react'

interface Props {
  eventId: string
  playerId: string
  playerName: string
  className?: string
  children?: React.ReactNode
}

export function ShareCardButton({ eventId, playerId, playerName, className, children }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleShare() {
    setLoading(true)
    try {
      const res = await fetch(`/api/card/${eventId}/${playerId}`)
      const blob = await res.blob()
      const filename = `${playerName.replace(/\s+/g, '-')}-americanify.png`
      const file = new File([blob], filename, { type: 'image/png' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${playerName} — Americanify` })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleShare} disabled={loading} className={className}>
      {loading ? 'Loading…' : (children ?? 'Share card')}
    </button>
  )
}
