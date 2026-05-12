'use client'

import QRCode from 'react-qr-code'

export function QRDisplay({ joinCode, eventName }: { joinCode: string; eventName: string }) {
  const url = `${window.location.origin}/e/${joinCode}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white gap-8 px-6">
      <p className="text-lg font-semibold text-gray-800">{eventName}</p>
      <QRCode value={url} size={280} />
      <div className="text-center">
        <p className="text-sm text-gray-500">Scan to join</p>
        <p className="mt-1 font-mono text-base font-medium text-gray-800">{url}</p>
      </div>
    </div>
  )
}
