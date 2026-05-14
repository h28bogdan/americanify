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
      if (prev.points !== curr.points || prev.wins !== curr.wins || prev.diff !== curr.diff) rank++
    }
    const s = stats.get(t.id)!
    return { teamId: t.id, name: `${t.playerAName} & ${t.playerBName}`, rank, ...s }
  })
}

export type RawMatch = {
  id: string
  match_players: { player_id: string; team: string }[]
  scores: { team_a_points: number; team_b_points: number } | null
}

export function computeTeamStandingsFromRaw(
  eventTeams: { id: string; player_a_id: string; player_b_id: string; playerAName: string; playerBName: string }[],
  rawMatches: RawMatch[]
): TeamStandingRow[] {
  const playerToTeamId = new Map<string, string>()
  for (const t of eventTeams) {
    playerToTeamId.set(t.player_a_id, t.id)
    playerToTeamId.set(t.player_b_id, t.id)
  }

  const teamMatches: TeamScoredMatchEntry[] = []
  for (const m of rawMatches) {
    if (!m.scores) continue
    const teamAPlayerId = (m.match_players as { player_id: string; team: string }[]).find((mp) => mp.team === 'A')?.player_id
    const teamBPlayerId = (m.match_players as { player_id: string; team: string }[]).find((mp) => mp.team === 'B')?.player_id
    const teamAId = teamAPlayerId ? playerToTeamId.get(teamAPlayerId) : undefined
    const teamBId = teamBPlayerId ? playerToTeamId.get(teamBPlayerId) : undefined
    if (teamAId) teamMatches.push({ teamId: teamAId, team: 'A', teamAPoints: m.scores.team_a_points, teamBPoints: m.scores.team_b_points })
    if (teamBId) teamMatches.push({ teamId: teamBId, team: 'B', teamAPoints: m.scores.team_a_points, teamBPoints: m.scores.team_b_points })
  }

  return computeTeamStandings(eventTeams, teamMatches)
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
        rank++
      }
    }
    const s = stats.get(p.id)!
    return { playerId: p.id, name: p.name, rank, ...s }
  })
}
