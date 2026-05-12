import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QRDisplay } from './qr-display'

export default async function QRPage({ params }: { params: { eventId: string } }) {
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

  return (
    <>
      <Link
        href={`/events/${params.eventId}`}
        className="fixed top-4 left-4 z-10 text-sm text-gray-400 hover:text-gray-700"
      >
        ← Back
      </Link>
      <QRDisplay joinCode={event.join_code} eventName={event.name} />
    </>
  )
}
