import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PlayerLinksDisplay } from './player-links-display'

export default async function PlayerLinksPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, name, join_code')
    .eq('id', params.eventId)
    .eq('organizer_id', user.id)
    .single()

  if (!event) notFound()

  const { data: eventPlayers } = await supabase
    .from('event_players')
    .select('player_id, players(id, name)')
    .eq('event_id', params.eventId)
    .eq('withdrawn', false)
    .order('players(name)')

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← {event.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Player links</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share each player's personal link — their identity is pre-set and locked once they vote.
          </p>
        </div>
        <PlayerLinksDisplay joinCode={event.join_code} players={players} />
      </div>
    </div>
  )
}
