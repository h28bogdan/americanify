export type PlayerInput = {
  id: string
  sit_out_count: number
}

export type CourtInput = {
  id: string
  court_number: number
  name: string | null
}

export type MatchHistoryEntry = {
  team_a: [string, string]
  team_b: [string, string]
}

export type CourtPairing = {
  court: CourtInput
  team_a: [string, string]
  team_b: [string, string]
}

export type RoundResult = {
  pairings: CourtPairing[]
  sit_out_ids: string[]
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function buildPairs(players: string[], partnerHistory: Set<string>): [string, string][] | null {
  const unmatched = new Set(players)
  const pairs: [string, string][] = []

  for (const player of players) {
    if (!unmatched.has(player)) continue
    unmatched.delete(player)

    let partner: string | null = null
    for (const candidate of Array.from(unmatched)) {
      if (!partnerHistory.has(pairKey(player, candidate))) {
        partner = candidate
        break
      }
    }

    // Fallback: any remaining player (repeat partner)
    if (!partner) partner = Array.from(unmatched)[0] ?? null
    if (!partner) return null

    unmatched.delete(partner)
    pairs.push([player, partner])
  }

  return pairs
}

export function generateRound(
  players: PlayerInput[],
  courts: CourtInput[],
  history: MatchHistoryEntry[]
): RoundResult {
  const partnerHistory = new Set<string>()
  const opponentHistory = new Set<string>()

  for (const { team_a, team_b } of history) {
    partnerHistory.add(pairKey(team_a[0], team_a[1]))
    partnerHistory.add(pairKey(team_b[0], team_b[1]))
    for (let i = 0; i < team_a.length; i++) {
      for (let j = 0; j < team_b.length; j++) {
        opponentHistory.add(pairKey(team_a[i], team_b[j]))
      }
    }
  }

  // Drop courts if not enough players
  const maxCourts = Math.min(courts.length, Math.floor(players.length / 4))
  const activeCourts = courts.slice(0, maxCourts)
  const playingCount = maxCourts * 4

  // Group players by sit_out_count, sort DESC (most sit-outs play first)
  const groups = new Map<number, string[]>()
  for (const p of players) {
    if (!groups.has(p.sit_out_count)) groups.set(p.sit_out_count, [])
    groups.get(p.sit_out_count)!.push(p.id)
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => b - a)
  const playing: string[] = []
  const sitOuts: string[] = []

  for (const [, group] of sortedGroups) {
    const shuffled = shuffle(group)
    const needed = playingCount - playing.length
    if (needed >= shuffled.length) {
      playing.push(...shuffled)
    } else {
      playing.push(...shuffled.slice(0, needed))
      sitOuts.push(...shuffled.slice(needed))
    }
  }

  // Try up to 10 shuffles, keep the result with fewest opponent repeats
  let best: { pairings: CourtPairing[]; score: number } | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const pairs = buildPairs(shuffle(playing), partnerHistory)
    if (!pairs) continue

    const shuffledPairs = shuffle(pairs)
    const pairings: CourtPairing[] = []
    let opponentRepeats = 0

    for (let i = 0; i < activeCourts.length; i++) {
      const team_a = shuffledPairs[i * 2]
      const team_b = shuffledPairs[i * 2 + 1]
      for (let ai = 0; ai < team_a.length; ai++) {
        for (let bi = 0; bi < team_b.length; bi++) {
          if (opponentHistory.has(pairKey(team_a[ai], team_b[bi]))) opponentRepeats++
        }
      }
      pairings.push({ court: activeCourts[i], team_a, team_b })
    }

    if (!best || opponentRepeats < best.score) {
      best = { pairings, score: opponentRepeats }
    }
    if (opponentRepeats === 0) break
  }

  return {
    pairings: best!.pairings,
    sit_out_ids: sitOuts,
  }
}
