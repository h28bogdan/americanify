import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, type ScoredMatchEntry } from '@/lib/utils/standings'
import { computeAwardWinners } from '@/lib/utils/recap'

const PUBLIC_CATEGORIES = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
  { id: 'preferred_partner', name: 'Preferred Partner' },
  { id: 'toughest_opponent', name: 'Toughest Opponent' },
]

export default async function RecapPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('id', params.eventId)
    .eq('organizer_id', user.id)
    .single()

  if (!event) notFound()
  if (event.status !== 'published') redirect(`/events/${params.eventId}`)

  const [{ data: eventPlayers }, { data: completedRounds }, { data: votes }] = await Promise.all([
    supabase.from('event_players').select('player_id, players(id, name)').eq('event_id', params.eventId).eq('withdrawn', false),
    supabase.from('rounds').select('id').eq('event_id', params.eventId).eq('status', 'completed'),
    supabase.from('votes').select('category_id, nominee_player_id').eq('event_id', params.eventId),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  const scoredMatches: ScoredMatchEntry[] = []
  const roundIds = completedRounds?.map((r) => r.id) ?? []
  if (roundIds.length) {
    const { data: rawMatches } = await supabase
      .from('matches')
      .select('id, match_players(player_id, team), scores(team_a_points, team_b_points)')
      .in('round_id', roundIds)

    for (const m of rawMatches ?? []) {
      const score = m.scores as unknown as { team_a_points: number; team_b_points: number } | null
      if (!score) continue
      for (const mp of (m.match_players as { player_id: string; team: string }[]) ?? []) {
        scoredMatches.push({
          playerId: mp.player_id,
          team: mp.team as 'A' | 'B',
          teamAPoints: score.team_a_points,
          teamBPoints: score.team_b_points,
        })
      }
    }
  }

  const standings = computeStandings(players, scoredMatches)
  const awards = computeAwardWinners(players, votes ?? [], PUBLIC_CATEGORIES)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← {event.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Recap</h1>
        </div>

        {/* Awards */}
        <div className="space-y-4">
          <p className="text-sm font-medium">Awards</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {awards.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{cat.name}</p>
                {cat.winners.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No votes</p>
                ) : (
                  <p className="text-sm font-semibold">
                    {cat.winners.map((w) => w.name).join(' & ')}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {cat.winners[0].voteCount} vote{cat.winners[0].voteCount !== 1 ? 's' : ''}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Final standings */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Final standings</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-10">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Pts</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">W</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {standings.map((row) => (
                  <tr key={row.playerId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
                    <td className="px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{row.points}</td>
                    <td className="px-4 py-2.5 text-right">{row.wins}</td>
                    <td className={`px-4 py-2.5 text-right ${row.diff > 0 ? 'text-green-700' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Player cards */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Player cards</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {standings.map((row) => (
              <div key={row.playerId} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{row.name}</span>
                <a
                  href={`/api/card/${params.eventId}/${row.playerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                >
                  View card →
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
