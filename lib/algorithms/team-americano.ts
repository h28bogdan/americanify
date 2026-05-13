import { type CourtInput } from './americano'

export type TeamInput = {
  id: string
  player_a_id: string
  player_b_id: string
  sit_out_count: number
}

export type TeamMatchHistoryEntry = {
  team_a_id: string
  team_b_id: string
}

export type TeamPairing = {
  court: CourtInput
  team_a: TeamInput
  team_b: TeamInput
}

export type TeamRoundResult = {
  pairings: TeamPairing[]
  sit_out_ids: string[]
}

function pairKey(a: string, b: string) {
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

export function generateTeamAmericanoRound(
  teams: TeamInput[],
  courts: CourtInput[],
  history: TeamMatchHistoryEntry[],
): TeamRoundResult {
  const opponentHistory = new Set<string>(
    history.map((h) => pairKey(h.team_a_id, h.team_b_id))
  )

  const maxCourts = Math.min(courts.length, Math.floor(teams.length / 2))
  const activeCourts = courts.slice(0, maxCourts)
  const playingCount = maxCourts * 2

  // Sit-out: teams with fewest sit-outs get priority to play
  const groups = new Map<number, TeamInput[]>()
  for (const t of teams) {
    if (!groups.has(t.sit_out_count)) groups.set(t.sit_out_count, [])
    groups.get(t.sit_out_count)!.push(t)
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => b - a)
  const playing: TeamInput[] = []
  const sitOutIds: string[] = []

  for (const [, group] of sortedGroups) {
    const shuffled = shuffle(group)
    const needed = playingCount - playing.length
    if (needed >= shuffled.length) {
      playing.push(...shuffled)
    } else {
      playing.push(...shuffled.slice(0, needed))
      sitOutIds.push(...shuffled.slice(needed).map((t) => t.id))
    }
  }

  // Try up to 10 shuffles to minimise repeat matchups
  let best: { pairings: TeamPairing[]; score: number } | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = shuffle(playing)
    const pairings: TeamPairing[] = []
    let repeats = 0

    for (let i = 0; i < activeCourts.length; i++) {
      const team_a = shuffled[i * 2]
      const team_b = shuffled[i * 2 + 1]
      if (opponentHistory.has(pairKey(team_a.id, team_b.id))) repeats++
      pairings.push({ court: activeCourts[i], team_a, team_b })
    }

    if (!best || repeats < best.score) best = { pairings, score: repeats }
    if (repeats === 0) break
  }

  return { pairings: best!.pairings, sit_out_ids: sitOutIds }
}
