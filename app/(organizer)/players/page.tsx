import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AddPlayerForm } from './add-player-form'

export default async function PlayersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: players } = await supabase
    .from('players')
    .select('id, name, level')
    .eq('organizer_id', user.id)
    .order('name')

  async function addPlayer(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const name = (formData.get('name') as string).trim()
    const levelRaw = formData.get('level') as string
    const level = levelRaw ? parseFloat(levelRaw) : null

    if (!name) return
    await supabase.from('players').insert({ organizer_id: user.id, name, level })
    revalidatePath('/players')
  }

  async function deletePlayer(formData: FormData) {
    'use server'
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const id = formData.get('id') as string
    await supabase.from('players').delete().eq('id', id).eq('organizer_id', user.id)
    revalidatePath('/players')
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Players</h1>
        </div>

        <div className="rounded-lg border border-border divide-y divide-border">
          {!players?.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No players yet. Add your first player below.
            </p>
          )}
          {players?.map((player) => (
            <div key={player.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium">{player.name}</span>
                {player.level != null && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    Level {Number(player.level).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/players/${player.id}`}>
                  <Button variant="outline" size="sm">Edit</Button>
                </Link>
                <form action={deletePlayer}>
                  <input type="hidden" name="id" value={player.id} />
                  <Button variant="destructive" size="sm" type="submit">Delete</Button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="font-medium">Add player</h2>
          <AddPlayerForm action={addPlayer} />
        </div>
      </div>
    </div>
  )
}
