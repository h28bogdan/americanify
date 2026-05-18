import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ShareCardButton } from '@/components/share-card-button'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, computeTeamStandingsFromRaw, type ScoredMatchEntry, type RawMatch } from '@/lib/utils/standings'
import { computeAwardWinners } from '@/lib/utils/recap'
import { VOTE_CATEGORIES } from '@/lib/constants/categories'

type AnyRow = { name: string; rank: number; points: number; wins: number; diff: number }

export default async function RecapPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, name, status, format')
    .eq('id', params.eventId)
    .eq('organizer_id', user.id)
    .single()

  if (!event) notFound()
  if (event.status !== 'published') redirect(`/events/${params.eventId}`)

  const isTeamFormat = event.format === 'team_americano'

  const [{ data: eventPlayers }, { data: completedRounds }, { data: votes }] = await Promise.all([
    supabase.from('event_players').select('player_id, players(id, name)').eq('event_id', params.eventId).eq('withdrawn', false),
    supabase.from('rounds').select('id').eq('event_id', params.eventId).eq('status', 'completed'),
    supabase.from('votes').select('category_id, nominee_player_id').eq('event_id', params.eventId),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  const roundIds = completedRounds?.map((r) => r.id) ?? []
  const rawMatchesData: RawMatch[] = []
  const scoredMatches: ScoredMatchEntry[] = []

  if (roundIds.length) {
    const { data: fetchedMatches } = await supabase
      .from('matches')
      .select('id, match_players(player_id, team), scores(team_a_points, team_b_points)')
      .in('round_id', roundIds)

    for (const m of fetchedMatches ?? []) {
      const score = m.scores as unknown as { team_a_points: number; team_b_points: number } | null
      rawMatchesData.push({
        id: m.id,
        match_players: (m.match_players as { player_id: string; team: string }[]) ?? [],
        scores: score,
      })
      if (!score) continue
      for (const mp of (m.match_players as { player_id: string; team: string }[]) ?? []) {
        scoredMatches.push({ playerId: mp.player_id, team: mp.team as 'A' | 'B', teamAPoints: score.team_a_points, teamBPoints: score.team_b_points })
      }
    }
  }

  let standings: AnyRow[]
  if (isTeamFormat) {
    const { data: eventTeams } = await supabase
      .from('event_teams')
      .select('id, player_a_id, player_b_id')
      .eq('event_id', params.eventId)
    const playerMap = new Map(players.map((p) => [p.id, p.name]))
    const teams = (eventTeams ?? []).map((t) => ({
      id: t.id,
      player_a_id: t.player_a_id,
      player_b_id: t.player_b_id,
      playerAName: playerMap.get(t.player_a_id) ?? '?',
      playerBName: playerMap.get(t.player_b_id) ?? '?',
    }))
    standings = computeTeamStandingsFromRaw(teams, rawMatchesData)
  } else {
    standings = computeStandings(players, scoredMatches)
  }

  const awards = computeAwardWinners(players, votes ?? [], VOTE_CATEGORIES)

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
                {standings.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
                    <td className="px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{row.points}</td>
                    <td className="px-4 py-2.5 text-right">{row.wins}</td>
                    <td className={`px-4 py-2.5 text-right ${row.diff > 0 ? 'text-green-400' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
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
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{p.name}</span>
                <div className="flex items-center gap-3">
                  <a
                    href={`/card/${params.eventId}/${p.id}?name=${encodeURIComponent(p.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View
                  </a>
                  <ShareCardButton
                    eventId={params.eventId}
                    playerId={p.id}
                    playerName={p.name}
                    className="text-xs text-primary font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    Share →
                  </ShareCardButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
