'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { StandingRow, TeamStandingRow } from '@/lib/utils/standings'

type AnyRow = Pick<StandingRow | TeamStandingRow, 'name' | 'rank' | 'points' | 'wins' | 'diff' | 'roundsPlayed'>

export function StandingsTable({ rows, live }: { rows: AnyRow[]; live: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!live) return
    const supabase = createClient()
    const channel = supabase
      .channel('standings-scores')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [live, router])

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No completed rounds yet.</p>
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-10">#</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Pts</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">W</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Diff</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Rds</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
              <td className="px-4 py-2.5 font-medium">{row.name}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{row.points}</td>
              <td className="px-4 py-2.5 text-right">{row.wins}</td>
              <td className={`px-4 py-2.5 text-right ${row.diff > 0 ? 'text-green-700' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {row.diff > 0 ? `+${row.diff}` : row.diff}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">{row.roundsPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
