import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <>{children}</>
}
