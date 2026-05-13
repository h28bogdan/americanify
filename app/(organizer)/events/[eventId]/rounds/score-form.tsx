'use client'

import { useState } from 'react'
import { SubmitButton } from '@/components/submit-button'

export type MatchForScoring = {
  id: string
  courtNumber: number
  courtName: string | null
  teamA: string[]
  teamB: string[]
  scoreA?: number
}

function CourtCard({
  match,
  scoreA,
  onChange,
}: {
  match: MatchForScoring
  scoreA: number
  onChange: (val: number) => void
}) {
  const scoreB = 24 - scoreA
  const label = match.courtName ?? `Court ${match.courtNumber}`

  return (
    <div className="space-y-2">
      {/* Court label */}
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>

      {/* Court diagram */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #3a9e6e 0%, #2d8a5c 100%)' }}
      >
        {/* Court surface */}
        <div className="relative" style={{ minHeight: 148 }}>

          {/* ── Court lines ── */}

          {/* Top sideline — full width */}
          <div className="absolute top-3 left-0 right-0 h-[1.5px] bg-white/60" />
          {/* Bottom sideline — full width */}
          <div className="absolute bottom-3 left-0 right-0 h-[1.5px] bg-white/60" />

          {/* Net — center vertical, thicker */}
          <div className="absolute top-3 bottom-3 left-1/2 w-[2px] -translate-x-1/2 bg-white/70" />

          {/* Service line — Team A (6.95m from net = 15.25% from back wall edge) */}
          <div className="absolute top-3 bottom-3 w-px bg-white/50" style={{ left: '15%' }} />
          {/* Service line — Team B (mirrored) */}
          <div className="absolute top-3 bottom-3 w-px bg-white/50" style={{ right: '15%' }} />

          {/* Center service line — horizontal at 50% height, spanning the service boxes */}
          <div className="absolute h-px bg-white/45" style={{ top: '50%', left: '15%', right: '15%' }} />

          {/* ── Players (on top of lines) ── */}
          <div className="relative grid grid-cols-2 z-10" style={{ minHeight: 148 }}>
            {/* Team A — left half */}
            <div className="flex flex-col h-full">
              <div className="flex-1 flex items-center justify-center px-3 pt-3 pb-1">
                <div className="bg-white/95 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-800 text-center truncate w-full">
                  {match.teamA[0]}
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center px-3 pb-3 pt-1">
                <div className="bg-white/95 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-800 text-center truncate w-full">
                  {match.teamA[1]}
                </div>
              </div>
            </div>

            {/* Team B — right half */}
            <div className="flex flex-col h-full">
              <div className="flex-1 flex items-center justify-center px-3 pt-3 pb-1">
                <div className="bg-white/95 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-800 text-center truncate w-full">
                  {match.teamB[0]}
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center px-3 pb-3 pt-1">
                <div className="bg-white/95 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-800 text-center truncate w-full">
                  {match.teamB[1]}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center justify-center gap-3 bg-black/20 py-2.5 px-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(Math.max(0, scoreA - 1))}
              className="w-8 h-9 rounded-lg bg-white/20 text-white text-xl font-bold hover:bg-white/30 flex items-center justify-center select-none"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              name={`score_${match.id}`}
              required
              value={scoreA}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                onChange(isNaN(val) ? 0 : Math.max(0, Math.min(24, val)))
              }}
              onFocus={(e) => e.target.select()}
              className="w-10 h-9 rounded-lg border-0 bg-white/20 text-white text-center text-lg font-bold outline-none focus:bg-white/30 focus:ring-2 focus:ring-white/50"
            />
            <button
              type="button"
              onClick={() => onChange(Math.min(24, scoreA + 1))}
              className="w-8 h-9 rounded-lg bg-white/20 text-white text-xl font-bold hover:bg-white/30 flex items-center justify-center select-none"
            >
              +
            </button>
          </div>
          <span className="text-white/60 font-medium text-sm">—</span>
          <div className="w-14 h-9 flex items-center justify-center rounded-lg bg-white/10 text-white text-lg font-bold">
            {scoreB}
          </div>
        </div>
      </div>
    </div>
  )
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

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="round_id" value={roundId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {matches.map((match) => (
          <CourtCard
            key={match.id}
            match={match}
            scoreA={scores[match.id] ?? 12}
            onChange={(val) => setScores((prev) => ({ ...prev, [match.id]: val }))}
          />
        ))}
      </div>

      <SubmitButton className="w-full" pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  )
}
