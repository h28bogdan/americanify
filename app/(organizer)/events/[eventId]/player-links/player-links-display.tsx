'use client'

import QRCode from 'react-qr-code'
import { CopyButton } from '@/components/copy-button'

export function PlayerLinksDisplay({
  joinCode,
  players,
}: {
  joinCode: string
  players: { id: string; name: string }[]
}) {
  const base = `${window.location.origin}/e/${joinCode}`

  return (
    <div className="space-y-3">
      {players.map((p) => {
        const url = `${base}?p=${p.id}`
        return (
          <div key={p.id} className="rounded-lg border border-border p-4 flex items-center gap-4">
            <div className="shrink-0 bg-white p-1.5 rounded-lg">
              <QRCode value={url} size={72} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{url}</p>
            </div>
            <CopyButton text={url} />
          </div>
        )
      })}
    </div>
  )
}
