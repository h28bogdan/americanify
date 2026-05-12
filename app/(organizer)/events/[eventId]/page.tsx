import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

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
  active: 'bg-green-100 text-green-800',
  voting: 'bg-blue-100 text-blue-800',
  published: 'bg-purple-100 text-purple-800',
}

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: event }, { data: eventPlayers }, { data: courts }] = await Promise.all([
    supabase.from('events').select('id, name, status, join_code, format').eq('id', params.eventId).eq('organizer_id', user.id).single(),
    supabase.from('event_players').select('id, player_id, withdrawn, players(name, level)').eq('event_id', params.eventId).order('players(name)'),
    supabase.from('courts').select('id').eq('event_id', params.eventId),
  ])

  if (!event) notFound()

  const players = eventPlayers?.map((ep) => ({
    id: ep.id,
    withdrawn: ep.withdrawn,
    ...(ep.players as unknown as { name: string; level: number | null }),
  })) ?? []
  const activePlayers = players.filter((p) => !p.withdrawn)
  const courtCount = courts?.length ?? 0
  const canStart = players.length >= courtCount * 4

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
                  <Button type="submit">Start event</Button>
                </form>
              ) : (
                <p className="text-sm text-destructive self-center">
                  Need {courtCount * 4} players for {courtCount} court{courtCount !== 1 ? 's' : ''} — add more or edit the event.
                </p>
              )}
              <Link href={`/events/${params.eventId}/edit`}>
                <Button variant="outline">Edit event</Button>
              </Link>
            </>
          )}
          <form action={duplicateEvent}>
            <Button type="submit" variant="outline">Duplicate event</Button>
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

        {/* Players + courts summary */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Players ({activePlayers.length} active) · {courtCount} court{courtCount !== 1 ? 's' : ''}
          </p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {players.map((p) => (
              <div key={p.id} className={`flex items-center justify-between px-4 py-2.5 ${p.withdrawn ? 'opacity-40' : ''}`}>
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
                      <input type="hidden" name="event_player_id" value={p.id} />
                      <input type="hidden" name="withdrawn" value={String(p.withdrawn)} />
                      <Button variant={p.withdrawn ? 'outline' : 'destructive'} size="sm" type="submit">
                        {p.withdrawn ? 'Rejoin' : 'Withdraw'}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
