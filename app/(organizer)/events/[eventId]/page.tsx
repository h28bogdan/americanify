import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { CopyButton } from '@/components/copy-button'
import { TeamAssignment } from '@/components/team-assignment'

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  voting: 'Voting',
  published: 'Published',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-900/50 text-green-400',
  voting: 'bg-blue-900/50 text-blue-400',
  published: 'bg-purple-900/50 text-purple-400',
}

export default async function EventPage({ params, searchParams }: { params: { eventId: string }; searchParams: { confirm?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: event }, { data: eventPlayers }, { data: courts }] = await Promise.all([
    supabase.from('events').select('id, name, status, join_code, format').eq('id', params.eventId).eq('organizer_id', user.id).single(),
    supabase.from('event_players').select('id, player_id, withdrawn, players(id, name, level)').eq('event_id', params.eventId).order('players(name)'),
    supabase.from('courts').select('id').eq('event_id', params.eventId),
  ])

  if (!event) notFound()

  const isTeamFormat = event.format === 'team_americano'

  const players = eventPlayers?.map((ep) => ({
    epId: ep.id,
    id: (ep.players as unknown as { id: string; name: string; level: number | null }).id,
    withdrawn: ep.withdrawn,
    name: (ep.players as unknown as { id: string; name: string; level: number | null }).name,
    level: (ep.players as unknown as { id: string; name: string; level: number | null }).level,
  })) ?? []
  const activePlayers = players.filter((p) => !p.withdrawn)
  const courtCount = courts?.length ?? 0

  // Fetch teams for team formats
  let teams: { id: string; playerA: { id: string; name: string; level: number | null }; playerB: { id: string; name: string; level: number | null } }[] = []
  if (isTeamFormat) {
    const { data: eventTeams } = await supabase
      .from('event_teams')
      .select('id, player_a_id, player_b_id')
      .eq('event_id', params.eventId)

    const playerMap = new Map(activePlayers.map((p) => [p.id, p]))
    teams = (eventTeams ?? []).map((t) => ({
      id: t.id,
      playerA: playerMap.get(t.player_a_id) ?? { id: t.player_a_id, name: '?', level: null },
      playerB: playerMap.get(t.player_b_id) ?? { id: t.player_b_id, name: '?', level: null },
    }))
  }

  const assignedCount = teams.length * 2
  const allAssigned = isTeamFormat ? assignedCount === activePlayers.length : true
  const enoughPlayers = activePlayers.length >= courtCount * 4
  const canStart = enoughPlayers && allAssigned

  // ── Server actions ──────────────────────────────────────────────

  async function startEvent() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('events').update({ status: 'active' }).eq('id', params.eventId).eq('organizer_id', user.id)
    redirect(`/events/${params.eventId}`)
  }

  async function toggleWithdraw(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const eventPlayerId = formData.get('event_player_id') as string
    const withdrawn = formData.get('withdrawn') === 'true'
    await supabase.from('event_players').update({ withdrawn: !withdrawn }).eq('id', eventPlayerId)
    redirect(`/events/${params.eventId}`)
  }

  async function duplicateEvent() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: original } = await supabase.from('events').select('name, format').eq('id', params.eventId).eq('organizer_id', user.id).single()
    if (!original) return

    const { data: newEvent } = await supabase.from('events').insert({ organizer_id: user.id, name: original.name, format: original.format, join_code: generateJoinCode() }).select('id').single()
    if (!newEvent) return

    const [{ data: courts }, { data: players }] = await Promise.all([
      supabase.from('courts').select('court_number, name').eq('event_id', params.eventId),
      supabase.from('event_players').select('player_id').eq('event_id', params.eventId),
    ])

    if (courts?.length) await supabase.from('courts').insert(courts.map((c) => ({ event_id: newEvent.id, court_number: c.court_number, name: c.name })))
    if (players?.length) await supabase.from('event_players').insert(players.map((p) => ({ event_id: newEvent.id, player_id: p.player_id })))

    redirect(`/events/${newEvent.id}`)
  }

  async function deleteEvent() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('events').delete().eq('id', params.eventId).eq('organizer_id', user.id)
    redirect('/dashboard')
  }

  async function createTeam(playerAId: string, playerBId: string) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('event_teams').insert({ event_id: params.eventId, player_a_id: playerAId, player_b_id: playerBId })
    redirect(`/events/${params.eventId}`)
  }

  async function removeTeam(teamId: string) {
    'use server'
    const supabase = createClient()
    await supabase.from('event_teams').delete().eq('id', teamId)
    redirect(`/events/${params.eventId}`)
  }

  async function autoAssignTeams() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: epRows } = await supabase
      .from('event_players')
      .select('player_id, players(level)')
      .eq('event_id', params.eventId)
      .eq('withdrawn', false)

    const { data: existing } = await supabase.from('event_teams').select('player_a_id, player_b_id').eq('event_id', params.eventId)
    const assignedIds = new Set((existing ?? []).flatMap((t) => [t.player_a_id, t.player_b_id]))

    const unassigned = (epRows ?? [])
      .filter((ep) => !assignedIds.has(ep.player_id))
      .map((ep) => ({ id: ep.player_id, level: (ep.players as unknown as { level: number | null })?.level ?? 0 }))
      .sort((a, b) => b.level - a.level)

    const newTeams: { event_id: string; player_a_id: string; player_b_id: string }[] = []
    let lo = unassigned.length - 1
    let hi = 0
    while (hi < lo) {
      newTeams.push({ event_id: params.eventId, player_a_id: unassigned[hi].id, player_b_id: unassigned[lo].id })
      hi++
      lo--
    }

    if (newTeams.length) await supabase.from('event_teams').insert(newTeams)
    redirect(`/events/${params.eventId}`)
  }

  const confirmingDelete = searchParams.confirm === 'delete'

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">← Dashboard</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{event.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}>
              {STATUS_LABELS[event.status]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Join code: <span className="font-mono font-medium">{event.join_code}</span>
            </p>
            <Link href={`/events/${params.eventId}/qr`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              QR →
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {event.status === 'draft' && (
            <>
              {canStart ? (
                <form action={startEvent}>
                  <SubmitButton pendingLabel="Starting…">Start event</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-destructive self-center">
                  {!enoughPlayers
                    ? `Need ${courtCount * 4} players for ${courtCount} court${courtCount !== 1 ? 's' : ''} — add more or edit the event.`
                    : `${activePlayers.length - assignedCount} player${activePlayers.length - assignedCount !== 1 ? 's' : ''} not yet in a team.`}
                </p>
              )}
              <Link href={`/events/${params.eventId}/edit`}>
                <Button variant="outline">Edit event</Button>
              </Link>
            </>
          )}
          <form action={duplicateEvent}>
            <SubmitButton variant="outline" pendingLabel="Duplicating…">Duplicate event</SubmitButton>
          </form>
        </div>

        {/* Nav links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Rounds', href: `/events/${event.id}/rounds`, enabled: event.status !== 'draft' },
            { label: 'Standings', href: `/events/${event.id}/standings`, enabled: event.status !== 'draft' },
            { label: 'Voting', href: `/events/${event.id}/voting`, enabled: event.status === 'voting' || event.status === 'published' },
            { label: 'Recap', href: `/events/${event.id}/recap`, enabled: event.status === 'published' },
          ].map(({ label, href, enabled }) =>
            enabled ? (
              <Link key={label} href={href} className="flex items-center justify-center rounded-lg border border-border py-4 text-sm font-medium hover:bg-muted/50 transition-colors">
                {label}
              </Link>
            ) : (
              <div key={label} className="flex items-center justify-center rounded-lg border border-border py-4 text-sm font-medium text-muted-foreground opacity-40 cursor-not-allowed select-none">
                {label}
              </div>
            )
          )}
        </div>

        {/* Teams section (team formats, draft only) */}
        {isTeamFormat && event.status === 'draft' && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Teams</p>
            <TeamAssignment
              players={activePlayers.map((p) => ({ id: p.id, name: p.name, level: p.level }))}
              teams={teams}
              createTeam={createTeam}
              removeTeam={removeTeam}
              autoAssign={autoAssignTeams}
            />
          </div>
        )}

        {/* Players + courts summary */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Players ({activePlayers.length} active) · {courtCount} court{courtCount !== 1 ? 's' : ''}
          </p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {players.map((p) => (
              <div key={p.epId} className={`flex items-center justify-between px-4 py-2.5 ${p.withdrawn ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{p.name}</span>
                  {p.withdrawn && <span className="text-xs text-muted-foreground">withdrawn</span>}
                </div>
                <div className="flex items-center gap-3">
                  {p.level != null && (
                    <span className="text-sm text-muted-foreground">Level {Number(p.level).toFixed(1)}</span>
                  )}
                  {event.status === 'active' && (
                    <form action={toggleWithdraw}>
                      <input type="hidden" name="event_player_id" value={p.epId} />
                      <input type="hidden" name="withdrawn" value={String(p.withdrawn)} />
                      <SubmitButton variant={p.withdrawn ? 'outline' : 'destructive'} size="sm" pendingLabel="…">
                        {p.withdrawn ? 'Rejoin' : 'Withdraw'}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Share recap */}
        {event.status === 'published' && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">Share recap</p>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {`https://americanify.vercel.app/e/${event.join_code}/recap`}
            </p>
            <CopyButton text={`https://americanify.vercel.app/e/${event.join_code}/recap`} />
          </div>
        )}

        {/* Danger zone */}
        <div className="border-t border-border pt-6">
          {!confirmingDelete ? (
            <Link href="?confirm=delete" className="text-sm text-destructive hover:underline">
              Delete event
            </Link>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">
                Delete &ldquo;{event.name}&rdquo;? This removes all rounds, scores, and votes and cannot be undone.
              </p>
              <div className="flex gap-3">
                <form action={deleteEvent}>
                  <SubmitButton variant="destructive" size="sm" pendingLabel="Deleting…">Yes, delete</SubmitButton>
                </form>
                <Link href="?" className="text-sm text-muted-foreground hover:underline self-center">
                  Cancel
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
