import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]

export default async function EditPlayerPage({ params }: { params: { playerId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: player } = await supabase
    .from('players')
    .select('id, name, level')
    .eq('id', params.playerId)
    .eq('organizer_id', user.id)
    .single()

  if (!player) notFound()

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-sm space-y-6">
        <div>
          <Link href="/players" className="text-sm text-muted-foreground hover:underline">
            ← Players
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Edit player</h1>
        </div>

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

          <Button type="submit" className="w-full">Save</Button>
        </form>
      </div>
    </div>
  )
}
