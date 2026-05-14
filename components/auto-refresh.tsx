'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ interval = 30000 }: { interval?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [router, interval])
  return null
}
