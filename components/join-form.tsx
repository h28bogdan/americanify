'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'

export function JoinForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = inputRef.current?.value.trim().toUpperCase()
    if (code) router.push(`/e/${code}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        placeholder="Enter join code"
        maxLength={5}
        autoCapitalize="characters"
        className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono uppercase tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
      />
      <Button type="submit" className="h-10">Go</Button>
    </form>
  )
}
