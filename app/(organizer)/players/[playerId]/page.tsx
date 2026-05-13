import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]

type EventStat = {
  eventId: string
  eventName: string
  eventDate: string
  points: number
  wins: number
  diff: number
  matches: number
}

export default async function PlayerProfilePage({ params }: { params: { playerId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: player } = await supabase
    .from('players')
    .select('id, name, level, created_at')
    .eq('id', params.playerId)
    .eq('organizer_id', user.id)
    .single()

  if (!player) notFound()

  const { data: eventPlayerRows } = await supabase
    .from('event_players')
    .select('event_id, events(id, name, status, created_at)')
    .eq('player_id', params.playerId)

  const events = (eventPlayerRows ?? []).map((ep) => {
    const e = ep.events as unknown as { id: string; name: string; status: string; created_at: string }
    return e
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const eventStats: EventStat[] = []

  if (events.length) {
    const eventIds = events.map((e) => e.id)

    const { data: completedRounds } = await supabase
      .from('rounds')
      .select('id, event_id')
      .in('event_id', eventIds)
      .eq('status', 'completed')

    const roundIds = (completedRounds ?? []).map((r) => r.id)

    let rawMatches: { id: string; round_id: string; match_players: { player_id: string; team: string }[]; scores: { team_a_points: number; team_b_points: number } | null }[] = []

    if (roundIds.length) {
      const { data } = await supabase
        .from('matches')
        .select('id, round_id, match_players(player_id, team), scores(team_a_points, team_b_points)')
        .in('round_id', roundIds)
      rawMatches = (data ?? []) as unknown as typeof rawMatches
    }

    const roundToEvent = Object.fromEntries((completedRounds ?? []).map((r) => [r.id, r.event_id]))

    const statsByEvent = new Map<string, { points: number; wins: number; scored: number; conceded: number; matches: number }>()

    for (const m of rawMatches) {
      const score = m.scores
      if (!score) continue
      const eventId = roundToEvent[m.round_id]
      if (!eventId) continue

      const players = m.match_players as { player_id: string; team: string }[]
      const myEntry = players.find((mp) => mp.player_id === params.playerId)
      if (!myEntry) continue

      const myPoints = myEntry.team === 'A' ? score.team_a_points : score.team_b_points
      const oppPoints = myEntry.team === 'A' ? score.team_b_points : score.team_a_points
      const won = myPoints > oppPoints

      const cur = statsByEvent.get(eventId) ?? { points: 0, wins: 0, scored: 0, conceded: 0, matches: 0 }
      statsByEvent.set(eventId, {
        points: cur.points + myPoints,
        wins: cur.wins + (won ? 1 : 0),
        scored: cur.scored + myPoints,
        conceded: cur.conceded + oppPoints,
        matches: cur.matches + 1,
      })
    }

    for (const e of events) {
      const s = statsByEvent.get(e.id)
      eventStats.push({
        eventId: e.id,
        eventName: e.name,
        eventDate: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        points: s?.points ?? 0,
        wins: s?.wins ?? 0,
        diff: s ? s.scored - s.conceded : 0,
        matches: s?.matches ?? 0,
      })
    }
  }

  async function updatePlayer(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const name = (formData.get('name') as string).trim()
    const levelRaw = formData.get('level') as string
    const level = levelRaw ? parseFloat(levelRaw) : null

    if (!name) return
    await supabase
      .from('players')
      .update({ name, level })
      .eq('id', params.playerId)
      .eq('organizer_id', user.id)

    redirect('/players')
  }

  const currentLevel = player.level != null ? Number(player.level).toFixed(1) : ''
  const totalPoints = eventStats.reduce((s, e) => s + e.points, 0)
  const totalWins = eventStats.reduce((s, e) => s + e.wins, 0)
  const totalMatches = eventStats.reduce((s, e) => s + e.matches, 0)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/players" className="text-sm text-muted-foreground hover:underline">
            ← Players
          </Link>
          <div className="mt-1 flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold">{player.name}</h1>
            {player.level != null && (
              <span className="text-sm text-muted-foreground">Level {Number(player.level).toFixed(1)}</span>
            )}
          </div>
        </div>

        {/* Aggregate stats */}
        {totalMatches > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Points', value: totalPoints },
              { label: 'Wins', value: totalWins },
              { label: 'Matches', value: totalMatches },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border p-4 text-center">
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Event history */}
        {eventStats.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Event history</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Event</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Pts</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">W</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {eventStats.map((row) => (
                    <tr key={row.eventId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/events/${row.eventId}/recap`} className="font-medium hover:underline">
                          {row.eventName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.eventDate}</p>
                      </td>
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
        )}

        {/* Edit form */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Edit</p>
          <form action={updatePlayer} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={player.name}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="level" className="text-sm font-medium">Level</label>
              <select
                id="level"
                name="level"
                defaultValue={currentLevel}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">No level</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l.toFixed(1)}>{l.toFixed(1)}</option>
                ))}
              </select>
            </div>

            <SubmitButton className="w-full" pendingLabel="Saving…">Save</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  )
}
