import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, type ScoredMatchEntry } from '@/lib/utils/standings'
import { StandingsTable } from './standings-table'

export default async function StandingsPage({ params }: { params: { eventId: string } }) {
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
  if (event.status === 'draft') redirect(`/events/${params.eventId}`)

  const [{ data: eventPlayers }, { data: completedRounds }] = await Promise.all([
    supabase
      .from('event_players')
      .select('player_id, players(id, name)')
      .eq('event_id', params.eventId)
      .eq('withdrawn', false),
    supabase
      .from('rounds')
      .select('id')
      .eq('event_id', params.eventId)
      .eq('status', 'completed'),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  const matches: ScoredMatchEntry[] = []

  const roundIds = completedRounds?.map((r) => r.id) ?? []
  if (roundIds.length) {
    const { data: rawMatches } = await supabase
      .from('matches')
      .select('id, match_players(player_id, team), scores(team_a_points, team_b_points)')
      .in('round_id', roundIds)

    for (const m of rawMatches ?? []) {
      const score = (m.scores as unknown as { team_a_points: number; team_b_points: number } | null)
      if (!score) continue
      for (const mp of (m.match_players as { player_id: string; team: string }[]) ?? []) {
        matches.push({
          playerId: mp.player_id,
          team: mp.team as 'A' | 'B',
          teamAPoints: score.team_a_points,
          teamBPoints: score.team_b_points,
        })
      }
    }
  }

  const standings = computeStandings(players, matches)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← {event.name}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Standings</h1>
            {event.status === 'active' && (
              <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-green-100 text-green-800">Live</span>
            )}
          </div>
        </div>

        <StandingsTable rows={standings} live={event.status === 'active'} />
      </div>
    </div>
  )
}
