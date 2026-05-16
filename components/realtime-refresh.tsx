'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function RealtimeRefresh({ eventId }: { eventId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let scoresChannel: RealtimeChannel
    let roundsChannel: RealtimeChannel

    // Defer to let StrictMode cleanup cancel before channels are created
    const t = setTimeout(() => {
      scoresChannel = supabase
        .channel(`scores-${eventId}-${Math.random()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => router.refresh())
        .subscribe()

      roundsChannel = supabase
        .channel(`rounds-${eventId}-${Math.random()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `event_id=eq.${eventId}` }, () => router.refresh())
        .subscribe()
    }, 0)

    return () => {
      clearTimeout(t)
      if (scoresChannel) supabase.removeChannel(scoresChannel)
      if (roundsChannel) supabase.removeChannel(roundsChannel)
    }
  }, [eventId, router])

  return null
}
