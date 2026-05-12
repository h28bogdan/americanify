import { redirect, notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ScoreForm, type MatchForScoring } from './score-form'
import { generateRound, type MatchHistoryEntry } from '@/lib/algorithms/americano'

export default async function RoundsPage({ params, searchParams }: { params: { eventId: string }; searchParams: { edit?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: event }, { data: courts }, { data: rounds }] = await Promise.all([
    supabase.from('events').select('id, name, status').eq('id', params.eventId).eq('organizer_id', user.id).single(),
    supabase.from('courts').select('id, court_number, name, active').eq('event_id', params.eventId).order('court_number'),
    supabase.from('rounds').select('id, round_number, status').eq('event_id', params.eventId).order('round_number', { ascending: false }),
  ])

  if (!event) notFound()
  if (event.status !== 'active') redirect(`/events/${params.eventId}`)

  const currentRound = rounds?.[0] ?? null
  const hasActiveRound = currentRound && currentRound.status !== 'completed'

  // Fetch current round matches + player names if active
  let currentMatches: MatchForScoring[] = []
  let sitOutNames: string[] = []
  if (hasActiveRound) {
    const [{ data: rawMatches }, { data: activeEventPlayers }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, courts(court_number, name), match_players(player_id, team, players(name))')
        .eq('round_id', currentRound.id),
      supabase
        .from('event_players')
        .select('player_id, players(name)')
        .eq('event_id', params.eventId)
        .eq('withdrawn', false),
    ])

    const playingIds = new Set<string>()
    currentMatches = (rawMatches ?? []).map((m: any) => {
      const mps: { player_id: string; team: string; players: { name: string } }[] = m.match_players ?? []
      mps.forEach((mp) => playingIds.add(mp.player_id))
      return {
        id: m.id,
        courtNumber: m.courts?.court_number ?? 0,
        courtName: m.courts?.name ?? null,
        teamA: mps.filter((mp) => mp.team === 'A').map((mp) => mp.players?.name ?? ''),
        teamB: mps.filter((mp) => mp.team === 'B').map((mp) => mp.players?.name ?? ''),
      }
    }).sort((a, b) => a.courtNumber - b.courtNumber)

    sitOutNames = (activeEventPlayers ?? [])
      .filter((ep) => !playingIds.has(ep.player_id))
      .map((ep: any) => ep.players?.name ?? '')
      .filter(Boolean)
      .sort()
  }

  // Fetch edit round data if ?edit= param is set
  let editMatches: MatchForScoring[] = []
  const editRoundId = searchParams.edit ?? null
  if (editRoundId) {
    const { data: editRawMatches } = await supabase
      .from('matches')
      .select('id, courts(court_number, name), match_players(player_id, team, players(name)), scores(team_a_points)')
      .eq('round_id', editRoundId)

    editMatches = (editRawMatches ?? []).map((m: any) => {
      const mps: { player_id: string; team: string; players: { name: string } }[] = m.match_players ?? []
      const scoreA = m.scores?.[0]?.team_a_points ?? m.scores?.team_a_points ?? 12
      return {
        id: m.id,
        courtNumber: m.courts?.court_number ?? 0,
        courtName: m.courts?.name ?? null,
        teamA: mps.filter((mp) => mp.team === 'A').map((mp) => mp.players?.name ?? ''),
        teamB: mps.filter((mp) => mp.team === 'B').map((mp) => mp.players?.name ?? ''),
        scoreA,
      }
    }).sort((a, b) => a.courtNumber - b.courtNumber)
  }

  // ── Server actions ──────────────────────────────────────────────

  async function handleGenerateRound() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Validate: no incomplete rounds
    const { data: incomplete } = await supabase
      .from('rounds')
      .select('id')
      .eq('event_id', params.eventId)
      .neq('status', 'completed')
    if (incomplete?.length) return

    // Fetch active players
    const { data: eventPlayers } = await supabase
      .from('event_players')
      .select('player_id, sit_out_count, withdrawn')
      .eq('event_id', params.eventId)

    const activePlayers = (eventPlayers ?? [])
      .filter((p) => !p.withdrawn)
      .map((p) => ({ id: p.player_id, sit_out_count: p.sit_out_count }))

    // Fetch active courts
    const { data: activeCourts } = await supabase
      .from('courts')
      .select('id, court_number, name')
      .eq('event_id', params.eventId)
      .eq('active', true)
      .order('court_number')

    if (!activeCourts?.length || activePlayers.length < 4) return

    // Build match history for partner/opponent tracking
    const { data: allRounds } = await supabase.from('rounds').select('id').eq('event_id', params.eventId)
    const roundIds = allRounds?.map((r) => r.id) ?? []

    let history: MatchHistoryEntry[] = []
    if (roundIds.length) {
      const { data: allMatches } = await supabase.from('matches').select('id').in('round_id', roundIds)
      const matchIds = allMatches?.map((m) => m.id) ?? []

      if (matchIds.length) {
        const { data: allMPs } = await supabase
          .from('match_players')
          .select('match_id, player_id, team')
          .in('match_id', matchIds)

        const matchGroups = new Map<string, { A: string[]; B: string[] }>()
        for (const mp of allMPs ?? []) {
          if (!matchGroups.has(mp.match_id)) matchGroups.set(mp.match_id, { A: [], B: [] })
          matchGroups.get(mp.match_id)![mp.team as 'A' | 'B'].push(mp.player_id)
        }

        history = Array.from(matchGroups.values())
          .filter((m) => m.A.length === 2 && m.B.length === 2)
          .map((m) => ({ team_a: m.A as [string, string], team_b: m.B as [string, string] }))
      }
    }

    // Run algorithm
    const result = generateRound(activePlayers, activeCourts, history)

    // Get next round number
    const { data: lastRound } = await supabase
      .from('rounds')
      .select('round_number')
      .eq('event_id', params.eventId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single()

    const roundNumber = (lastRound?.round_number ?? 0) + 1

    // Create round
    const { data: round } = await supabase
      .from('rounds')
      .insert({ event_id: params.eventId, round_number: roundNumber, status: 'active' })
      .select('id')
      .single()
    if (!round) return

    // Create matches + match_players
    for (const pairing of result.pairings) {
      const { data: match } = await supabase
        .from('matches')
        .insert({ round_id: round.id, court_id: pairing.court.id })
        .select('id')
        .single()
      if (!match) continue

      await supabase.from('match_players').insert([
        { match_id: match.id, player_id: pairing.team_a[0], team: 'A' },
        { match_id: match.id, player_id: pairing.team_a[1], team: 'A' },
        { match_id: match.id, player_id: pairing.team_b[0], team: 'B' },
        { match_id: match.id, player_id: pairing.team_b[1], team: 'B' },
      ])
    }

    // Increment sit_out_count for players sitting out
    const sitOutPlayers = activePlayers.filter((p) => result.sit_out_ids.includes(p.id))
    for (const p of sitOutPlayers) {
      await supabase
        .from('event_players')
        .update({ sit_out_count: p.sit_out_count + 1 })
        .eq('event_id', params.eventId)
        .eq('player_id', p.id)
    }

    revalidatePath(`/events/${params.eventId}/rounds`)
  }

  async function handleSubmitScores(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const roundId = formData.get('round_id') as string
    const { data: matches } = await supabase.from('matches').select('id').eq('round_id', roundId)
    if (!matches?.length) return

    for (const match of matches) {
      const teamA = parseInt(formData.get(`score_${match.id}`) as string, 10)
      if (isNaN(teamA) || teamA < 0 || teamA > 24) return
      await supabase.from('scores').insert({ match_id: match.id, team_a_points: teamA, team_b_points: 24 - teamA })
    }

    await supabase.from('rounds').update({ status: 'completed' }).eq('id', roundId)
    revalidatePath(`/events/${params.eventId}/rounds`)
  }

  async function handleUpdateScores(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const roundId = formData.get('round_id') as string
    const { data: matches } = await supabase.from('matches').select('id').eq('round_id', roundId)
    if (!matches?.length) return

    for (const match of matches) {
      const teamA = parseInt(formData.get(`score_${match.id}`) as string, 10)
      if (isNaN(teamA) || teamA < 0 || teamA > 24) return
      await supabase.from('scores').upsert(
        { match_id: match.id, team_a_points: teamA, team_b_points: 24 - teamA },
        { onConflict: 'match_id' }
      )
    }

    redirect(`/events/${params.eventId}/rounds`)
  }

  async function handleToggleCourt(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const courtId = formData.get('court_id') as string
    const active = formData.get('active') === 'true'
    await supabase.from('courts').update({ active: !active }).eq('id', courtId)
    revalidatePath(`/events/${params.eventId}/rounds`)
  }

  async function handleEndEvent() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('events').update({ status: 'voting' }).eq('id', params.eventId).eq('organizer_id', user.id)
    redirect(`/events/${params.eventId}`)
  }

  // ── Render ──────────────────────────────────────────────────────

  const pastRounds = rounds?.slice(hasActiveRound ? 1 : 0) ?? []

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← {event.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Rounds</h1>
        </div>

        {/* Courts */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Courts</p>
          <div className="flex flex-wrap gap-2">
            {courts?.map((court) => (
              <form key={court.id} action={handleToggleCourt}>
                <input type="hidden" name="court_id" value={court.id} />
                <input type="hidden" name="active" value={String(court.active)} />
                <Button
                  type="submit"
                  variant={court.active ? 'default' : 'outline'}
                  size="sm"
                  disabled={hasActiveRound || false}
                >
                  {court.name ?? `Court ${court.court_number}`}
                  {court.active ? ' ✓' : ' ✗'}
                </Button>
              </form>
            ))}
          </div>
          {hasActiveRound && (
            <p className="text-xs text-muted-foreground">Submit scores before changing courts.</p>
          )}
        </div>

        {/* Current round */}
        {hasActiveRound && currentRound && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Round {currentRound.round_number}</p>
            <ScoreForm
              matches={currentMatches}
              roundId={currentRound.id}
              action={handleSubmitScores}
            />
            {sitOutNames.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Sitting out: {sitOutNames.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        {!hasActiveRound && (
          <div className="flex gap-3">
            <form action={handleGenerateRound}>
              <Button type="submit">
                {rounds?.length ? 'Next round' : 'Generate first round'}
              </Button>
            </form>
            <form action={handleEndEvent}>
              <Button type="submit" variant="outline">End event</Button>
            </form>
          </div>
        )}

        {/* Past rounds */}
        {pastRounds.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Previous rounds</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {pastRounds.map((round) => (
                <div key={round.id}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm">Round {round.round_number}</span>
                    {editRoundId === round.id ? (
                      <Link href="?" className="text-xs text-muted-foreground hover:underline">Cancel</Link>
                    ) : (
                      <Link href={`?edit=${round.id}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                        Edit scores
                      </Link>
                    )}
                  </div>
                  {editRoundId === round.id && editMatches.length > 0 && (
                    <div className="px-4 pb-4">
                      <ScoreForm
                        matches={editMatches}
                        roundId={round.id}
                        action={handleUpdateScores}
                        submitLabel="Update scores"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
