import { type CourtInput, type CourtPairing, type RoundResult } from './americano'

export type PlayerInputWithPoints = {
  id: string
  sit_out_count: number
  points: number
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function generateMexicanoRound(
  players: PlayerInputWithPoints[],
  courts: CourtInput[],
): RoundResult {
  const maxCourts = Math.min(courts.length, Math.floor(players.length / 4))
  const activeCourts = courts.slice(0, maxCourts)
  const playingCount = maxCourts * 4

  // Sit-out: players with fewest sit-outs get priority to play
  const groups = new Map<number, PlayerInputWithPoints[]>()
  for (const p of players) {
    if (!groups.has(p.sit_out_count)) groups.set(p.sit_out_count, [])
    groups.get(p.sit_out_count)!.push(p)
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => b - a)
  const playing: PlayerInputWithPoints[] = []
  const sitOuts: PlayerInputWithPoints[] = []

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

  // Shuffle first so ties (e.g. round 1 all-zero) are random, then stable sort by points
  const ranked = shuffle(playing).sort((a, b) => b.points - a.points)

  // Snake pairing: for each group of 4 [a,b,c,d] → (a+d) vs (b+c)
  const pairings: CourtPairing[] = []
  for (let i = 0; i < activeCourts.length; i++) {
    const a = ranked[i * 4 + 0]
    const b = ranked[i * 4 + 1]
    const c = ranked[i * 4 + 2]
    const d = ranked[i * 4 + 3]
    pairings.push({
      court: activeCourts[i],
      team_a: [a.id, d.id],
      team_b: [b.id, c.id],
    })
  }

  return {
    pairings,
    sit_out_ids: sitOuts.map((p) => p.id),
  }
}
