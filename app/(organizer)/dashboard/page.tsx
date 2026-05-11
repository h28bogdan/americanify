import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  voting: 'bg-blue-100 text-blue-800',
  published: 'bg-purple-100 text-purple-800',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: events }, { data: players }] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, status, created_at')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('players')
      .select('id, name, level')
      .eq('organizer_id', user.id)
      .order('name'),
  ])

  async function signOut() {
    'use server'
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">Sign out</Button>
          </form>
        </div>

        {/* Players */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Players</h2>
            <Link href="/players">
              <Button size="sm" variant="outline">Manage</Button>
            </Link>
          </div>
          <div className="rounded-lg border border-border divide-y divide-border">
            {!players?.length && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No players yet.{' '}
                <Link href="/players" className="underline">Add your roster.</Link>
              </p>
            )}
            {players?.map((player) => (
              <div key={player.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{player.name}</span>
                {player.level != null && (
                  <span className="text-sm text-muted-foreground">Level {Number(player.level).toFixed(1)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-medium">Events</h2>
          <Link href="/events/new">
            <Button size="sm">New event</Button>
          </Link>
        </div>

        <div className="rounded-lg border border-border divide-y divide-border">
          {!events?.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No events yet.{' '}
              <Link href="/events/new" className="underline">Create your first event.</Link>
            </p>
          )}
          {events?.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">{event.name}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}>
                {event.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
