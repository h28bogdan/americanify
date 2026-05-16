import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, computeTeamStandingsFromRaw, type ScoredMatchEntry, type RawMatch } from '@/lib/utils/standings'
import { PlayerPicker, IdentitySaver, ClearIdentityButton } from '@/components/player-identity'
import { RealtimeRefresh } from '@/components/realtime-refresh'
import { CourtDisplay } from '@/components/court-display'
import { VOTE_CATEGORIES } from '@/lib/constants/categories'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-900/50 text-green-400',
  voting: 'bg-blue-900/50 text-blue-400',
  published: 'bg-purple-900/50 text-purple-400',
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
      <div className="hidden xl:flex flex-col h-screen overflow-hidden" style={{ background: '#0b0f1a', color: '#f1f5f9' }}>
        {event.status === 'active' && <RealtimeRefresh eventId={event.id} />}

        {/* Top bar */}
        <div className="flex items-center justify-between px-12 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Americanify
          </span>
          <span className="text-base font-semibold">{event.name}</span>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {activeRoundRow ? `Round ${activeRoundRow.round_number}` : 'Live'}
            </span>
          </div>
        </div>

        {/* Columns */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: pairings — 75% */}
          <div className="flex-[3] flex flex-col overflow-hidden border-r px-10 py-8 gap-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {activeMatches.length > 0 ? (
              <div
                className="grid gap-6"
                style={{
                  gridTemplateColumns: activeMatches.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                }}
              >
                {activeMatches.map((m, i) => (
                  <div key={i} style={{ aspectRatio: '4/3' }}>
                    <CourtDisplay
                      courtLabel={m.courtLabel}
                      teamA={m.teamA.map((p) => p.name)}
                      teamB={m.teamB.map((p) => p.name)}
                      size="lg"
                      labelColor="rgba(255,255,255,0.7)"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex-1 flex items-center justify-center text-2xl" style={{ color: 'rgba(255,255,255,0.3)' }}>Waiting for next round…</p>
            )}

            {sitOutNames.length > 0 && (
              <p className="text-sm shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Sitting out: {sitOutNames.join(', ')}
              </p>
            )}
          </div>

          {/* Right: standings — 25% */}
          <div className="flex-1 flex flex-col px-8 py-8 overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th className="pb-2 text-left pr-6 w-8" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>#</th>
                  <th className="pb-2 text-left" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Player</th>
                  <th className="pb-2 text-right pl-6 w-16" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Pts</th>
                  <th className="pb-2 text-right pl-6 w-12" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>W</th>
                  <th className="pb-2 text-right pl-6 w-16" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>+/−</th>
                </tr>
              </thead>
              <tbody>
                {standingsRows.map((row) => {
                  const rankColor = row.rank === 1 ? '#fbbf24' : row.rank === 2 ? '#94a3b8' : row.rank === 3 ? '#f97316' : 'rgba(255,255,255,0.4)'
                  return (
                    <tr key={row.i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-2.5 pr-6 text-lg font-bold tabular-nums" style={{ color: rankColor }}>{row.rank}</td>
                      <td className="py-2.5 text-lg font-semibold truncate max-w-0" style={{ width: '100%' }}>{row.name}</td>
                      <td className="py-2.5 pl-6 text-lg font-bold tabular-nums text-right">{row.points}</td>
                      <td className="py-2.5 pl-6 text-lg tabular-nums text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{row.wins}</td>
                      <td className="py-2.5 pl-6 text-sm tabular-nums text-right" style={{ color: row.diff > 0 ? '#4ade80' : row.diff < 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Mobile layout — <1280px ──────────────────────────────── */}
      <div className="xl:hidden min-h-screen bg-background p-6">
        {event.status === 'active' && <RealtimeRefresh eventId={event.id} />}
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
            <div className="space-y-3">
              <p className="text-sm font-medium">Round {activeRoundRow.round_number} — Playing now</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeMatches.map((m, i) => {
                  const allIds = [...m.teamA.map((p) => p.id), ...m.teamB.map((p) => p.id)]
                  const isMyMatch = voter && allIds.includes(voter.id)
                  return (
                    <div key={i} className={isMyMatch ? 'ring-2 ring-primary rounded-2xl' : ''}>
                      <CourtDisplay
                        courtLabel={m.courtLabel}
                        teamA={m.teamA.map((p) => p.name)}
                        teamB={m.teamB.map((p) => p.name)}
                        size="sm"
                      />
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
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                {standings.map((row, i) => {
                  const rankColor = row.rank === 1 ? 'text-amber-500' : row.rank === 2 ? 'text-slate-400' : row.rank === 3 ? 'text-orange-500' : 'text-muted-foreground'
                  const isMe = voter?.id === row.playerId
                  return (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-muted/50' : ''}`}>
                      <span className={`text-sm font-bold w-5 tabular-nums shrink-0 ${rankColor}`}>{row.rank}</span>
                      <span className={`text-sm flex-1 min-w-0 truncate ${isMe ? 'font-semibold' : 'font-medium'}`}>{row.name}</span>
                      <span className="text-sm font-bold tabular-nums shrink-0">{row.points}</span>
                      <span className={`text-xs w-10 text-right tabular-nums shrink-0 ${row.diff > 0 ? 'text-green-600' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </span>
                    </div>
                  )
                })}
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
                    {Object.keys(existingVotes).length === 0 && (
                      <ClearIdentityButton joinCode={params.joinCode} />
                    )}
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
