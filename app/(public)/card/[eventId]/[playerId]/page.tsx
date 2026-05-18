import { ShareCardButton } from '@/components/share-card-button'

export default function CardViewPage({
  params,
  searchParams,
}: {
  params: { eventId: string; playerId: string }
  searchParams: { name?: string }
}) {
  const playerName = searchParams.name ?? 'Player'

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-4">
      <img
        src={`/api/card/${params.eventId}/${params.playerId}`}
        alt={`${playerName}'s card`}
        className="max-h-[80vh] w-auto rounded-2xl shadow-2xl"
      />
      <ShareCardButton
        eventId={params.eventId}
        playerId={params.playerId}
        playerName={playerName}
        className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Share →
      </ShareCardButton>
    </div>
  )
}
