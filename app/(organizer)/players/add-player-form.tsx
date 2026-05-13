'use client'

import { useRef } from 'react'
import { SubmitButton } from '@/components/submit-button'

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]

export function AddPlayerForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData)
        formRef.current?.reset()
      }}
      className="flex items-center gap-3"
    >
      <input
        name="name"
        type="text"
        required
        placeholder="Name"
        className="flex-1 h-8 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      <select
        name="level"
        className="h-8 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        <option value="">Level</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>{l.toFixed(1)}</option>
        ))}
      </select>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
    </form>
  )
}
