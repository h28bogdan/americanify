'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Player = { id: string; name: string; level: number | null }
type Team = { id: string; playerA: Player; playerB: Player }

export function TeamAssignment({
  players,
  teams,
  createTeam,
  removeTeam,
  autoAssign,
}: {
  players: Player[]
  teams: Team[]
  createTeam: (playerAId: string, playerBId: string) => Promise<void>
  removeTeam: (teamId: string) => Promise<void>
  autoAssign: () => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const assignedIds = new Set(teams.flatMap((t) => [t.playerA.id, t.playerB.id]))
  const unassigned = players.filter((p) => !assignedIds.has(p.id))

  async function handlePick(playerId: string) {
    if (pending) return
    if (!selected) {
      setSelected(playerId)
      return
    }
    if (selected === playerId) {
      setSelected(null)
      return
    }
    setPending(true)
    setSelected(null)
    await createTeam(selected, playerId)
    setPending(false)
  }

  async function handleAutoAssign() {
    setPending(true)
    await autoAssign()
    setPending(false)
  }

  async function handleRemove(teamId: string) {
    setPending(true)
    await removeTeam(teamId)
    setPending(false)
  }

  return (
    <div className="space-y-4">
      {/* Existing teams */}
      {teams.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium">{team.playerA.name} & {team.playerB.name}</span>
              <button
                onClick={() => handleRemove(team.id)}
                disabled={pending}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unassigned players */}
      {unassigned.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {selected ? 'Now pick their partner' : 'Tap a player to start pairing'}
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePick(p.id)}
                disabled={pending}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                  selected === p.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Auto-assign */}
      {unassigned.length >= 2 && (
        <Button variant="outline" size="sm" onClick={handleAutoAssign} disabled={pending}>
          Auto-assign by level
        </Button>
      )}
    </div>
  )
}
