import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JoinForm } from '@/components/join-form'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">

        {/* Wordmark */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Americanify</h1>
          <p className="text-sm text-muted-foreground">Social padel events, beautifully simple.</p>
        </div>

        {/* Join an event */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-center">Join an event</p>
          <JoinForm />
        </div>

        {/* Organizer link */}
        <p className="text-center text-sm text-muted-foreground">
          Organizer?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in →
          </Link>
        </p>

      </div>
    </div>
  )
}
