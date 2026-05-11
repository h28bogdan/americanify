'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Player = { id: string; name: string; level: number | null }

export function EditEventForm({
  defaultName,
  defaultCourtCount,
  defaultCourtNames,
  players,
  selectedPlayerIds,
  action,
}: {
  defaultName: string
  defaultCourtCount: number
  defaultCourtNames: string[]
  players: Player[]
  selectedPlayerIds: Set<string>
  action: (formData: FormData) => Promise<void>
}) {
  const [courtCount, setCourtCount] = useState(defaultCourtCount)
  const [courtNames, setCourtNames] = useState<string[]>(defaultCourtNames)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selectedPlayerIds))

  function handleCourtCountChange(n: number) {
    setCourtCount(n)
    setCourtNames((prev) => {
      const next = [...prev]
      while (next.length < n) next.push('')
      return next.slice(0, n)
    })
  }

  const needed = courtCount * 4
  const hasEnough = selectedIds.size >= needed

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <form action={action} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">Event name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full h-8 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="court_count" className="text-sm font-medium">Number of courts</label>
        <select
          id="court_count"
          name="court_count"
          value={courtCount}
          onChange={(e) => handleCourtCountChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Court names <span className="text-muted-foreground font-normal">(optional)</span></p>
        {Array.from({ length: courtCount }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Court {i + 1}</span>
            <input
              name={`court_name_${i + 1}`}
              type="text"
              placeholder={`Court ${i + 1}`}
              value={courtNames[i] ?? ''}
              onChange={(e) => setCourtNames((prev) => { const next = [...prev]; next[i] = e.target.value; return next })}
              className="flex-1 h-8 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Players</p>
          <p className={`text-sm ${hasEnough ? 'text-muted-foreground' : 'text-destructive'}`}>
            {selectedIds.size} selected · {needed} needed
          </p>
        </div>

        <div className="rounded-lg border border-border divide-y divide-border">
          {players.map((player) => (
            <label key={player.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                name="player_ids"
                value={player.id}
                checked={selectedIds.has(player.id)}
                onChange={() => togglePlayer(player.id)}
                className="h-4 w-4 rounded"
              />
              <span className="flex-1 text-sm font-medium">{player.name}</span>
              {player.level != null && (
                <span className="text-sm text-muted-foreground">Level {Number(player.level).toFixed(1)}</span>
              )}
            </label>
          ))}
        </div>

        {!hasEnough && selectedIds.size > 0 && (
          <p className="text-sm text-destructive">
            Select {needed - selectedIds.size} more player{needed - selectedIds.size !== 1 ? 's' : ''} for {courtCount} court{courtCount !== 1 ? 's' : ''}.
          </p>
        )}
      </div>

      <Button type="submit" disabled={!hasEnough}>Save changes</Button>
    </form>
  )
}
