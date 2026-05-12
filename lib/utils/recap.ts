export type AwardWinner = { playerId: string; name: string; voteCount: number }
export type CategoryResult = { id: string; name: string; winners: AwardWinner[] }

export function computeAwardWinners(
  players: { id: string; name: string }[],
  votes: { category_id: string; nominee_player_id: string }[],
  categories: { id: string; name: string }[]
): CategoryResult[] {
  const nameMap = Object.fromEntries(players.map((p) => [p.id, p.name]))

  return categories.map((cat) => {
    const tally = new Map<string, number>()
    for (const v of votes) {
      if (v.category_id !== cat.id) continue
      tally.set(v.nominee_player_id, (tally.get(v.nominee_player_id) ?? 0) + 1)
    }
    if (!tally.size) return { ...cat, winners: [] }

    const max = Math.max(...Array.from(tally.values()))
    const winners: AwardWinner[] = Array.from(tally.entries())
      .filter(([, count]) => count === max)
      .map(([id, count]) => ({ playerId: id, name: nameMap[id] ?? 'Unknown', voteCount: count }))

    return { ...cat, winners }
  })
}

export type MatchPlayerEntry = {
  matchId: string
  playerId: string
  team: 'A' | 'B'
  teamPoints: number
}

export function computeBestPartner(
  playerId: string,
  entries: MatchPlayerEntry[],
  playerNames: Record<string, string>
): { name: string; combinedPoints: number } | null {
  const partnerPoints = new Map<string, number>()

  for (const entry of entries) {
    if (entry.playerId !== playerId) continue
    const partner = entries.find(
      (e) => e.matchId === entry.matchId && e.team === entry.team && e.playerId !== playerId
    )
    if (!partner) continue
    partnerPoints.set(partner.playerId, (partnerPoints.get(partner.playerId) ?? 0) + entry.teamPoints)
  }

  if (!partnerPoints.size) return null

  const [bestId, bestPoints] = Array.from(partnerPoints.entries()).reduce(
    (best, curr) => (curr[1] > best[1] ? curr : best)
  )

  const name = playerNames[bestId]
  if (!name) return null
  return { name, combinedPoints: bestPoints }
}
