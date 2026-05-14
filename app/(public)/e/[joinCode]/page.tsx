import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, computeTeamStandingsFromRaw, type ScoredMatchEntry, type RawMatch } from '@/lib/utils/standings'
import { PlayerPicker, IdentitySaver, ClearIdentityButton } from '@/components/player-identity'
import { AutoRefresh } from '@/components/auto-refresh'
import { VOTE_CATEGORIES } from '@/lib/constants/categories'

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

type PublicRow = { name: string; rank: number; points: number; wins: number; diff: number; roundsPlayed: number; playerId?: string }
type ActiveMatch = { courtLabel: string; courtNumber: number; teamA: { id: string; name: string }[]; teamB: { id: string; name: string }[] }

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
    .select('id, name, status, format')
    .eq('join_code', params.joinCode)
    .single()

  if (!event || event.status === 'draft') notFound()

  const isTeamFormat = event.format === 'team_americano'

  const [{ data: eventPlayers }, { data: completedRounds }, { data: activeRoundRow }] = await Promise.all([
    supabase.from('event_players').select('player_id, players(id, name)').eq('event_id', event.id).eq('withdrawn', false),
    supabase.from('rounds').select('id').eq('event_id', event.id).eq('status', 'completed'),
    supabase.from('rounds').select('id, round_number').eq('event_id', event.id).eq('status', 'active').maybeSingle(),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  // Fetch active round matches
  let activeMatches: ActiveMatch[] = []
  let sitOutNames: string[] = []
  if (activeRoundRow) {
    const { data: rawActive } = await supabase
      .from('matches')
      .select('id, courts(court_number, name), match_players(player_id, team, players(id, name))')
      .eq('round_id', activeRoundRow.id)

    const playingIds = new Set<string>()
    activeMatches = ((rawActive ?? []) as any[]).map((m) => {
      const mps: { player_id: string; team: string; players: { id: string; name: string } }[] = m.match_players ?? []
      mps.forEach((mp) => playingIds.add(mp.player_id))
      return {
        courtLabel: m.courts?.name ?? `Court ${m.courts?.court_number ?? '?'}`,
        courtNumber: m.courts?.court_number ?? 0,
        teamA: mps.filter((mp) => mp.team === 'A').map((mp) => ({ id: mp.player_id, name: mp.players?.name ?? '' })),
        teamB: mps.filter((mp) => mp.team === 'B').map((mp) => ({ id: mp.player_id, name: mp.players?.name ?? '' })),
      }
    }).sort((a, b) => a.courtNumber - b.courtNumber)

    sitOutNames = players.filter((p) => !playingIds.has(p.id)).map((p) => p.name).sort()
  }

  // Standings from completed rounds
  const roundIds = completedRounds?.map((r) => r.id) ?? []
  const rawMatchesData: RawMatch[] = []
  const scoredMatches: ScoredMatchEntry[] = []
  let allMatchPlayers: { matchId: string; playerId: string; team: string }[] = []

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
      for (const mp of (m.match_players as { player_id: string; team: string }[]) ?? []) {
        allMatchPlayers.push({ matchId: m.id, playerId: mp.player_id, team: mp.team })
        if (!score) continue
        scoredMatches.push({ playerId: mp.player_id, team: mp.team as 'A' | 'B', teamAPoints: score.team_a_points, teamBPoints: score.team_b_points })
      }
    }
  }

  let standings: PublicRow[]
  if (isTeamFormat) {
    const { data: eventTeams } = await supabase.from('event_teams').select('id, player_a_id, player_b_id').eq('event_id', event.id)
    const playerMap = new Map(players.map((p) => [p.id, p.name]))
    const teams = (eventTeams ?? []).map((t) => ({
      id: t.id, player_a_id: t.player_a_id, player_b_id: t.player_b_id,
      playerAName: playerMap.get(t.player_a_id) ?? '?',
      playerBName: playerMap.get(t.player_b_id) ?? '?',
    }))
    standings = computeTeamStandingsFromRaw(teams, rawMatchesData)
  } else {
    standings = computeStandings(players, scoredMatches)
  }

  // Voter identity
  const voterId = searchParams.p
  const voter = voterId ? players.find((p) => p.id === voterId) ?? null : null

  const partnerIds = new Set<string>()
  const opponentIds = new Set<string>()
  if (voter) {
    const voterMatches = allMatchPlayers.filter((mp) => mp.playerId === voter.id)
    for (const vm of voterMatches) {
      for (const mp of allMatchPlayers) {
        if (mp.matchId !== vm.matchId || mp.playerId === voter.id) continue
        if (mp.team === vm.team) partnerIds.add(mp.playerId)
        else opponentIds.add(mp.playerId)
      }
    }
  }

  const existingVotes: Record<string, string> = {}
  if (voter && (event.status === 'voting' || event.status === 'published')) {
    const { data: votes } = await supabase
      .from('votes').select('category_id, nominee_player_id')
      .eq('event_id', event.id).eq('voter_player_id', voter.id)
    for (const v of votes ?? []) existingVotes[v.category_id] = v.nominee_player_id
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
    await supabase.from('votes').delete()
      .eq('event_id', eventId).eq('voter_player_id', voterPlayerId).eq('category_id', categoryId)
    revalidatePath(`/e/${params.joinCode}`)
  }

  const showVoting = event.status === 'voting' || event.status === 'published'

  // Shared standings table rows (used in both layouts)
  const standingsRows = standings.map((row, i) => ({ ...row, i }))

  return (
    <>
      {/* ── TV layout — ≥1280px ──────────────────────────────────── */}
      <div className="hidden xl:flex h-screen overflow-hidden bg-background">
        <AutoRefresh interval={30000} />

        {/* Left: pairings */}
        <div className="flex-1 flex flex-col gap-10 p-14 border-r border-border overflow-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{event.name}</p>
            <p className="mt-1 text-2xl font-semibold">
              {activeRoundRow ? `Round ${activeRoundRow.round_number}` : 'No active round'}
            </p>
          </div>

          {activeMatches.length > 0 ? (
            <div className="space-y-10">
              {activeMatches.map((m, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">{m.courtLabel}</p>
                  <div className="flex items-center gap-8">
                    <div className="space-y-1">
                      {m.teamA.map((p) => (
                        <p key={p.id} className="text-4xl font-semibold leading-tight">{p.name}</p>
                      ))}
                    </div>
                    <p className="text-3xl text-muted-foreground font-light shrink-0">vs</p>
                    <div className="space-y-1">
                      {m.teamB.map((p) => (
                        <p key={p.id} className="text-4xl font-semibold leading-tight">{p.name}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xl text-muted-foreground">Waiting for next round…</p>
          )}

          {sitOutNames.length > 0 && (
            <p className="mt-auto text-base text-muted-foreground">
              Sitting out: {sitOutNames.join(', ')}
            </p>
          )}
        </div>

        {/* Right: standings */}
        <div className="flex-1 flex flex-col gap-10 p-14 overflow-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Standings</p>
          <div className="space-y-4">
            {standingsRows.map((row) => (
              <div key={row.i} className="flex items-baseline gap-5">
                <span className="text-2xl text-muted-foreground w-10 shrink-0 tabular-nums">{row.rank}</span>
                <span className="text-4xl font-semibold flex-1 leading-tight">{row.name}</span>
                <span className="text-4xl font-bold tabular-nums">{row.points}</span>
                <span className={`text-2xl w-24 text-right tabular-nums ${row.diff > 0 ? 'text-green-700' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile layout — <1280px ──────────────────────────────── */}
      <div className="xl:hidden min-h-screen bg-background p-6">
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

          {/* Recap banner */}
          {event.status === 'published' && (
            <Link
              href={`/e/${params.joinCode}/recap`}
              className="flex items-center justify-between rounded-lg bg-foreground px-4 py-3 text-background hover:opacity-90 transition-opacity"
            >
              <span className="text-sm font-medium">Recap &amp; player cards are ready</span>
              <span className="text-sm">→</span>
            </Link>
          )}

          {/* Active round */}
          {activeRoundRow && activeMatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Round {activeRoundRow.round_number} — Playing now</p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {activeMatches.map((m, i) => {
                  const allIds = [...m.teamA.map((p) => p.id), ...m.teamB.map((p) => p.id)]
                  const isMyMatch = voter && allIds.includes(voter.id)
                  return (
                    <div key={i} className={`px-4 py-3 ${isMyMatch ? 'bg-muted/40' : ''}`}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{m.courtLabel}</p>
                      <p className="text-sm">
                        <span className="font-medium">{m.teamA.map((p) => p.name).join(' & ')}</span>
                        <span className="text-muted-foreground mx-2">vs</span>
                        <span className="font-medium">{m.teamB.map((p) => p.name).join(' & ')}</span>
                      </p>
                    </div>
                  )
                })}
              </div>
              {sitOutNames.length > 0 && (
                <p className="text-xs text-muted-foreground">Sitting out: {sitOutNames.join(', ')}</p>
              )}
            </div>
          )}

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
                    {standings.map((row, i) => (
                      <tr key={i} className={voter?.id === row.playerId ? 'bg-muted/40' : ''}>
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
                <PlayerPicker joinCode={params.joinCode} players={players} />
              ) : (
                <div className="space-y-6">
                  <IdentitySaver joinCode={params.joinCode} playerId={voter.id} />
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Voting as <span className="font-semibold">{voter.name}</span>
                    </p>
                    <ClearIdentityButton joinCode={params.joinCode} />
                  </div>

                  {VOTE_CATEGORIES.map((cat) => {
                    const votedNomineeId = existingVotes[cat.id]
                    const votedNomineeName = votedNomineeId ? players.find((p) => p.id === votedNomineeId)?.name : null
                    const otherPlayers = players.filter((p) => {
                      if (p.id === voter.id) return false
                      if (cat.id === 'preferred_partner') return partnerIds.has(p.id)
                      if (cat.id === 'toughest_opponent') return opponentIds.has(p.id)
                      return true
                    })

                    return (
                      <div key={cat.id} className="space-y-2">
                        <div>
                          <p className="text-sm font-medium">{cat.name}</p>
                          <p className="text-xs text-muted-foreground">{cat.description}</p>
                        </div>
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
                        ) : event.status === 'voting' && otherPlayers.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No matches played yet.</p>
                        ) : event.status === 'voting' ? (
                          <div className="rounded-lg border border-border divide-y divide-border">
                            {otherPlayers.map((nominee) => (
                              <form key={nominee.id} action={castVote}>
                                <input type="hidden" name="event_id" value={event.id} />
                                <input type="hidden" name="voter_player_id" value={voter.id} />
                                <input type="hidden" name="nominee_player_id" value={nominee.id} />
                                <input type="hidden" name="category_id" value={cat.id} />
                                <button type="submit" className="w-full text-left px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
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
    </>
  )
}
