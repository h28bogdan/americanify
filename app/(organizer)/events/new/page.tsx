import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NewEventForm } from './new-event-form'

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default async function NewEventPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: players } = await supabase
    .from('players')
    .select('id, name, level')
    .eq('organizer_id', user.id)
    .order('name')

  async function createEvent(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const name = (formData.get('name') as string).trim()
    const format = (formData.get('format') as string) || 'americano'
    const courtCount = parseInt(formData.get('court_count') as string, 10)
    const playerIds = formData.getAll('player_ids') as string[]

    if (!name || isNaN(courtCount) || playerIds.length < courtCount * 4) return

    const { data: event, error } = await supabase
      .from('events')
      .insert({ organizer_id: user.id, name, format, join_code: generateJoinCode() })
      .select('id')
      .single()

    if (error || !event) return

    await supabase.from('courts').insert(
      Array.from({ length: courtCount }, (_, i) => ({
        event_id: event.id,
        court_number: i + 1,
        name: (formData.get(`court_name_${i + 1}`) as string)?.trim() || null,
      }))
    )

    await supabase.from('event_players').insert(
      playerIds.map((player_id) => ({ event_id: event.id, player_id }))
    )

    redirect(`/events/${event.id}`)
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">New event</h1>
        </div>
        <NewEventForm players={players ?? []} action={createEvent} />
      </div>
    </div>
  )
}
