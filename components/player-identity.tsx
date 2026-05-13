'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const storageKey = (joinCode: string) => `player-${joinCode}`

export function PlayerPicker({
  joinCode,
  players,
}: {
  joinCode: string
  players: { id: string; name: string }[]
}) {
  const router = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(joinCode))
    if (saved && players.some((p) => p.id === saved)) {
      router.replace(`?p=${saved}`)
    }
  }, [])

  function pick(playerId: string) {
    localStorage.setItem(storageKey(joinCode), playerId)
    router.push(`?p=${playerId}`)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Who are you?</p>
      <div className="rounded-lg border border-border divide-y divide-border">
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className="w-full text-left flex items-center px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function IdentitySaver({ joinCode, playerId }: { joinCode: string; playerId: string }) {
  useEffect(() => {
    localStorage.setItem(storageKey(joinCode), playerId)
  }, [playerId])
  return null
}

export function ClearIdentityButton({ joinCode }: { joinCode: string }) {
  const router = useRouter()

  function clear() {
    localStorage.removeItem(storageKey(joinCode))
    router.replace('?')
  }

  return (
    <button onClick={clear} className="text-xs text-muted-foreground hover:underline">
      Change
    </button>
  )
}
