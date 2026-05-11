import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, type ScoredMatchEntry } from '@/lib/utils/standings'

const PUBLIC_CATEGORIES = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
  { id: 'preferred_partner', name: 'Preferred Partner' },
  { id: 'toughest_opponent', name: 'Toughest Opponent' },
]

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  voting: 'bg-blue-100 text-blue-800',
  published: 'bg-purple-100 text-purple-800',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Live',
  voting: 'Voting open',
  published: 'Published',
}

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: { joinCode: string }
  searchParams: { p?: string }
}) {
  const supabase = createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('join_code', params.joinCode)
    .single()

  if (!event || event.status === 'draft') notFound()

  const [{ data: eventPlayers }, { data: completedRounds }] = await Promise.all([
    supabase
      .from('event_players')
      .select('player_id, players(id, name)')
      .eq('event_id', event.id)
      .eq('withdrawn', false),
    supabase
      .from('rounds')
      .select('id')
      .eq('event_id', event.id)
      .eq('status', 'completed'),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  // Compute standings
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

  // Resolve voter from search param
  const voterId = searchParams.p
  const voter = voterId ? players.find((p) => p.id === voterId) ?? null : null

  // Fetch existing votes if voter is identified
  const existingVotes: Record<string, string> = {}
  if (voter && (event.status === 'voting' || event.status === 'published')) {
    const { data: votes } = await supabase
      .from('votes')
      .select('category_id, nominee_player_id')
      .eq('event_id', event.id)
      .eq('voter_player_id', voter.id)

    for (const v of votes ?? []) {
      existingVotes[v.category_id] = v.nominee_player_id
    }
  }

  async function castVote(formData: FormData) {
    'use server'
    const supabase = createClient()
    const eventId = formData.get('event_id') as string
    const voterPlayerId = formData.get('voter_player_id') as string
    const nomineePlayerId = formData.get('nominee_player_id') as string
    const categoryId = formData.get('category_id') as string
    if (!eventId || !voterPlayerId || !nomineePlayerId || !categoryId) return
    if (voterPlayerId === nomineePlayerId) return

    await supabase.from('votes').upsert(
      { event_id: eventId, voter_player_id: voterPlayerId, nominee_player_id: nomineePlayerId, category_id: categoryId },
      { onConflict: 'event_id,voter_player_id,category_id' }
    )
    revalidatePath(`/e/${params.joinCode}`)
  }

  async function clearVote(formData: FormData) {
    'use server'
    const supabase = createClient()
    const eventId = formData.get('event_id') as string
    const voterPlayerId = formData.get('voter_player_id') as string
    const categoryId = formData.get('category_id') as string
    if (!eventId || !voterPlayerId || !categoryId) return

    await supabase
      .from('votes')
      .delete()
      .eq('event_id', eventId)
      .eq('voter_player_id', voterPlayerId)
      .eq('category_id', categoryId)
    revalidatePath(`/e/${params.joinCode}`)
  }

  const showVoting = event.status === 'voting' || event.status === 'published'

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          {STATUS_STYLES[event.status] && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}>
              {STATUS_LABELS[event.status]}
            </span>
          )}
        </div>

        {/* Standings */}
        {standings.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Standings</p>
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
                  {standings.map((row) => (
                    <tr key={row.playerId} className={voter?.id === row.playerId ? 'bg-muted/40' : ''}>
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
          </div>
        )}

        {/* Voting section */}
        {showVoting && (
          <div className="space-y-4">
            {!voter ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Who are you?</p>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {players.map((p) => (
                    <Link
                      key={p.id}
                      href={`/e/${params.joinCode}?p=${p.id}`}
                      className="flex items-center px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Voting as <span className="font-semibold">{voter.name}</span>
                  </p>
                  <Link href={`/e/${params.joinCode}`} className="text-xs text-muted-foreground hover:underline">
                    Change
                  </Link>
                </div>

                {PUBLIC_CATEGORIES.map((cat) => {
                  const votedNomineeId = existingVotes[cat.id]
                  const votedNomineeName = votedNomineeId
                    ? players.find((p) => p.id === votedNomineeId)?.name
                    : null
                  const otherPlayers = players.filter((p) => p.id !== voter.id)

                  return (
                    <div key={cat.id} className="space-y-2">
                      <p className="text-sm font-medium">{cat.name}</p>
                      {votedNomineeName ? (
                        <div className="rounded-lg border border-border px-4 py-3 flex items-center justify-between bg-muted/30">
                          <span className="text-sm font-medium">{votedNomineeName}</span>
                          {event.status === 'voting' && (
                            <form action={clearVote}>
                              <input type="hidden" name="event_id" value={event.id} />
                              <input type="hidden" name="voter_player_id" value={voter.id} />
                              <input type="hidden" name="category_id" value={cat.id} />
                              <button type="submit" className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                                Undo
                              </button>
                            </form>
                          )}
                        </div>
                      ) : event.status === 'voting' ? (
                        <div className="rounded-lg border border-border divide-y divide-border">
                          {otherPlayers.map((nominee) => (
                            <form key={nominee.id} action={castVote}>
                              <input type="hidden" name="event_id" value={event.id} />
                              <input type="hidden" name="voter_player_id" value={voter.id} />
                              <input type="hidden" name="nominee_player_id" value={nominee.id} />
                              <input type="hidden" name="category_id" value={cat.id} />
                              <button
                                type="submit"
                                className="w-full text-left px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                              >
                                {nominee.name}
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No vote cast.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
