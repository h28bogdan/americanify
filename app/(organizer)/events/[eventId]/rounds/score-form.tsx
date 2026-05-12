'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export type MatchForScoring = {
  id: string
  courtNumber: number
  courtName: string | null
  teamA: string[]
  teamB: string[]
  scoreA?: number
}

export function ScoreForm({
  matches,
  roundId,
  action,
  submitLabel = 'Submit scores',
}: {
  matches: MatchForScoring[]
  roundId: string
  action: (formData: FormData) => Promise<void>
  submitLabel?: string
}) {
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(matches.map((m) => [m.id, m.scoreA ?? 12]))
  )

  function courtLabel(m: MatchForScoring) {
    return m.courtName ?? `Court ${m.courtNumber}`
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="round_id" value={roundId} />

      {matches.map((match) => (
        <div key={match.id} className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{courtLabel(match)}</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm font-medium">{match.teamA.join(' & ')}</div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                name={`score_${match.id}`}
                min={0}
                max={24}
                required
                value={scores[match.id]}
                onChange={(e) =>
                  setScores((prev) => ({ ...prev, [match.id]: Math.max(0, Math.min(24, Number(e.target.value))) }))
                }
                className="w-14 h-8 rounded-lg border border-border bg-background px-2 text-center text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <span className="text-muted-foreground">–</span>
              <span className="w-14 h-8 flex items-center justify-center rounded-lg bg-muted text-sm font-medium">
                {24 - (scores[match.id] ?? 12)}
              </span>
            </div>
            <div className="flex-1 text-sm font-medium text-right">{match.teamB.join(' & ')}</div>
          </div>
        </div>
      ))}

      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  )
}
