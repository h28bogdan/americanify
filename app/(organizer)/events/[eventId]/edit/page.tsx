import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EditEventForm } from './edit-event-form'

export default async function EditEventPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: event }, { data: allPlayers }, { data: courts }, { data: eventPlayers }] = await Promise.all([
    supabase.from('events').select('id, name, status').eq('id', params.eventId).eq('organizer_id', user.id).single(),
    supabase.from('players').select('id, name, level').eq('organizer_id', user.id).order('name'),
    supabase.from('courts').select('id').eq('event_id', params.eventId),
    supabase.from('event_players').select('player_id').eq('event_id', params.eventId),
  ])

  if (!event) notFound()
  if (event.status !== 'draft') redirect(`/events/${params.eventId}`)

  async function updateEvent(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const name = (formData.get('name') as string).trim()
    const courtCount = parseInt(formData.get('court_count') as string, 10)
    const playerIds = formData.getAll('player_ids') as string[]

    if (!name || isNaN(courtCount) || playerIds.length < courtCount * 4) return

    await supabase.from('events').update({ name }).eq('id', params.eventId).eq('organizer_id', user.id)

    await supabase.from('courts').delete().eq('event_id', params.eventId)
    await supabase.from('courts').insert(
      Array.from({ length: courtCount }, (_, i) => ({
        event_id: params.eventId,
        court_number: i + 1,
      }))
    )

    await supabase.from('event_players').delete().eq('event_id', params.eventId)
    await supabase.from('event_players').insert(
      playerIds.map((player_id) => ({ event_id: params.eventId, player_id }))
    )

    redirect(`/events/${params.eventId}`)
  }

  const currentPlayerIds = new Set(eventPlayers?.map((ep) => ep.player_id) ?? [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← Event
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Edit event</h1>
        </div>
        <EditEventForm
          defaultName={event.name}
          defaultCourtCount={courts?.length ?? 1}
          players={allPlayers ?? []}
          selectedPlayerIds={currentPlayerIds}
          action={updateEvent}
        />
      </div>
    </div>
  )
}
