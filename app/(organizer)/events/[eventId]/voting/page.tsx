import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SubmitButton } from '@/components/submit-button'

const PUBLIC_CATEGORIES = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
  { id: 'preferred_partner', name: 'Preferred Partner' },
  { id: 'toughest_opponent', name: 'Toughest Opponent' },
]

export default async function VotingPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, name, status, join_code')
    .eq('id', params.eventId)
    .eq('organizer_id', user.id)
    .single()

  if (!event) notFound()
  if (event.status === 'draft' || event.status === 'active') redirect(`/events/${params.eventId}`)

  const [{ data: eventPlayers }, { data: votes }] = await Promise.all([
    supabase
      .from('event_players')
      .select('player_id, players(id, name)')
      .eq('event_id', params.eventId)
      .eq('withdrawn', false),
    supabase
      .from('votes')
      .select('category_id, voter_player_id, nominee_player_id')
      .eq('event_id', params.eventId),
  ])

  const players = (eventPlayers ?? []).map((ep) => ({
    id: (ep.players as unknown as { id: string; name: string }).id,
    name: (ep.players as unknown as { id: string; name: string }).name,
  }))
  const playerCount = players.length

  // Compute tallies per category
  type Tally = { nomineeId: string; name: string; count: number }
  const tallies: Record<string, Tally[]> = {}
  const votersByCategory: Record<string, Set<string>> = {}

  for (const cat of PUBLIC_CATEGORIES) {
    tallies[cat.id] = []
    votersByCategory[cat.id] = new Set()
  }

  for (const vote of votes ?? []) {
    if (!tallies[vote.category_id]) continue
    votersByCategory[vote.category_id].add(vote.voter_player_id)
    const existing = tallies[vote.category_id].find((t) => t.nomineeId === vote.nominee_player_id)
    if (existing) {
      existing.count++
    } else {
      const name = players.find((p) => p.id === vote.nominee_player_id)?.name ?? 'Unknown'
      tallies[vote.category_id].push({ nomineeId: vote.nominee_player_id, name, count: 1 })
    }
  }

  for (const cat of PUBLIC_CATEGORIES) {
    tallies[cat.id].sort((a, b) => b.count - a.count)
  }

  async function publishRecap() {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('events')
      .update({ status: 'published' })
      .eq('id', params.eventId)
      .eq('organizer_id', user.id)
    redirect(`/events/${params.eventId}`)
  }

  const publicUrl = `/e/${event.join_code}`

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/events/${params.eventId}`} className="text-sm text-muted-foreground hover:underline">
            ← {event.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Voting</h1>
        </div>

        {/* Share link */}
        <div className="rounded-lg border border-border px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Player link</p>
            <Link href={`/events/${params.eventId}/qr`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              Show QR →
            </Link>
          </div>
          <p className="text-sm font-mono text-muted-foreground">{publicUrl}</p>
          <p className="text-xs text-muted-foreground">Share this with players so they can vote and see standings.</p>
        </div>

        {/* Category tallies */}
        <div className="space-y-4">
          {PUBLIC_CATEGORIES.map((cat) => {
            const catTallies = tallies[cat.id]
            const voterCount = votersByCategory[cat.id].size
            const leader = catTallies[0]
            const topCount = leader?.count ?? 0
            const winners = catTallies.filter((t) => t.count === topCount && topCount > 0)

            return (
              <div key={cat.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{voterCount} / {playerCount} voted</p>
                </div>
                {catTallies.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No votes yet.</p>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {catTallies.map((t) => (
                      <div key={t.nomineeId} className="flex items-center justify-between px-4 py-2.5">
                        <span className={`text-sm ${winners.some((w) => w.nomineeId === t.nomineeId) ? 'font-semibold' : ''}`}>
                          {t.name}
                        </span>
                        <span className="text-sm text-muted-foreground">{t.count} vote{t.count !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Publish */}
        {event.status === 'voting' && (
          <form action={publishRecap}>
            <SubmitButton pendingLabel="Publishing…">Publish recap</SubmitButton>
          </form>
        )}
        {event.status === 'published' && (
          <p className="text-sm text-muted-foreground">Recap published. Voting is closed.</p>
        )}
      </div>
    </div>
  )
}
