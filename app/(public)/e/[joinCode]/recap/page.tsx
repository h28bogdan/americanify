import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, computeTeamStandingsFromRaw, type ScoredMatchEntry, type RawMatch } from '@/lib/utils/standings'
import { computeAwardWinners } from '@/lib/utils/recap'

const PUBLIC_CATEGORIES = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
  { id: 'preferred_partner', name: 'Preferred Partner' },
  { id: 'toughest_opponent', name: 'Toughest Opponent' },
]

type AnyRow = { name: string; rank: number; points: number; wins: number; diff: number; playerId?: string }

export default async function PublicRecapPage({
  params,
  searchParams,
}: {
  params: { joinCode: string }
  searchParams: { p?: string }
}) {
  const supabase = createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name, status, format')
    .eq('join_code', params.joinCode)
    .single()

  if (!event) notFound()
  if (event.status !== 'published') redirect(`/e/${params.joinCode}`)

  const isTeamFormat = event.format === 'team_americano'

  const [{ data: eventPlayers }, { data: completedRounds }, { data: votes }] = await Promise.all([
    supabase.from('event_players').select('player_id, players(id, name)').eq('event_id', event.id).eq('withdrawn', false),
    supabase.from('rounds').select('id').eq('event_id', event.id).eq('status', 'completed'),
    supabase.from('votes').select('category_id, nominee_player_id').eq('event_id', event.id),
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
      .eq('event_id', event.id)
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

  const awards = computeAwardWinners(players, votes ?? [], PUBLIC_CATEGORIES)

  const selectedPlayer = searchParams.p ? players.find((p) => p.id === searchParams.p) : null

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <Link href={`/e/${params.joinCode}`} className="text-sm text-muted-foreground hover:underline">
            ← Back
          </Link>
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
                  <p className="text-sm font-semibold">{cat.winners.map((w) => w.name).join(' & ')}</p>
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
                  <tr key={i} className={selectedPlayer?.id === row.playerId ? 'bg-muted/40' : ''}>
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

        {/* Get my card */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Get your card</p>
          {!selectedPlayer ? (
            <div className="rounded-lg border border-border divide-y divide-border">
              {players.map((p) => (
                <Link
                  key={p.id}
                  href={`/e/${params.joinCode}/recap?p=${p.id}`}
                  className="flex items-center px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <a
                href={`/api/card/${event.id}/${selectedPlayer.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Open {selectedPlayer.name}'s card →
              </a>
              <Link href={`/e/${params.joinCode}/recap`} className="text-sm text-muted-foreground hover:underline">
                Change
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
