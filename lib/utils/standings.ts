export type TeamStandingRow = {
  teamId: string
  name: string
  rank: number
  points: number
  wins: number
  diff: number
  roundsPlayed: number
}

export type TeamScoredMatchEntry = {
  teamId: string
  team: 'A' | 'B'
  teamAPoints: number
  teamBPoints: number
}

export function computeTeamStandings(
  teams: { id: string; playerAName: string; playerBName: string }[],
  matches: TeamScoredMatchEntry[]
): TeamStandingRow[] {
  const stats = new Map<string, { points: number; wins: number; diff: number; roundsPlayed: number }>()
  for (const t of teams) stats.set(t.id, { points: 0, wins: 0, diff: 0, roundsPlayed: 0 })

  for (const m of matches) {
    const s = stats.get(m.teamId)
    if (!s) continue
    const mine = m.team === 'A' ? m.teamAPoints : m.teamBPoints
    const theirs = m.team === 'A' ? m.teamBPoints : m.teamAPoints
    s.points += mine
    s.wins += mine > theirs ? 1 : 0
    s.diff += mine - theirs
    s.roundsPlayed += 1
  }

  const sorted = [...teams].sort((a, b) => {
    const sa = stats.get(a.id)!
    const sb = stats.get(b.id)!
    if (sb.points !== sa.points) return sb.points - sa.points
    if (sb.wins !== sa.wins) return sb.wins - sa.wins
    return sb.diff - sa.diff
  })

  let rank = 1
  return sorted.map((t, i) => {
    if (i > 0) {
      const prev = stats.get(sorted[i - 1].id)!
      const curr = stats.get(t.id)!
      if (prev.points !== curr.points || prev.wins !== curr.wins || prev.diff !== curr.diff) rank = i + 1
    }
    const s = stats.get(t.id)!
    return { teamId: t.id, name: `${t.playerAName} & ${t.playerBName}`, rank, ...s }
  })
}

export type StandingRow = {
  playerId: string
  name: string
  rank: number
  points: number
  wins: number
  diff: number
  roundsPlayed: number
}

export type ScoredMatchEntry = {
  playerId: string
  team: 'A' | 'B'
  teamAPoints: number
  teamBPoints: number
}

export function computeStandings(
  players: { id: string; name: string }[],
  matches: ScoredMatchEntry[]
): StandingRow[] {
  const stats = new Map<string, { points: number; wins: number; diff: number; roundsPlayed: number }>()
  for (const p of players) stats.set(p.id, { points: 0, wins: 0, diff: 0, roundsPlayed: 0 })

  for (const m of matches) {
    const s = stats.get(m.playerId)
    if (!s) continue
    const mine = m.team === 'A' ? m.teamAPoints : m.teamBPoints
    const theirs = m.team === 'A' ? m.teamBPoints : m.teamAPoints
    s.points += mine
    s.wins += mine > theirs ? 1 : 0
    s.diff += mine - theirs
    s.roundsPlayed += 1
  }

  const sorted = [...players].sort((a, b) => {
    const sa = stats.get(a.id)!
    const sb = stats.get(b.id)!
    if (sb.points !== sa.points) return sb.points - sa.points
    if (sb.wins !== sa.wins) return sb.wins - sa.wins
    return sb.diff - sa.diff
  })

  let rank = 1
  return sorted.map((p, i) => {
    if (i > 0) {
      const prev = stats.get(sorted[i - 1].id)!
      const curr = stats.get(p.id)!
      if (prev.points !== curr.points || prev.wins !== curr.wins || prev.diff !== curr.diff) {
        rank = i + 1
      }
    }
    const s = stats.get(p.id)!
    return { playerId: p.id, name: p.name, rank, ...s }
  })
}
