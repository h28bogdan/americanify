import { describe, it, expect } from 'vitest'
import { computeStandings, type ScoredMatchEntry } from '../utils/standings'

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
  { id: 'p4', name: 'Dave' },
]

describe('computeStandings', () => {
  it('returns a row for every player even with no matches', () => {
    const rows = computeStandings(players, [])
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.points === 0 && r.wins === 0 && r.diff === 0)).toBe(true)
  })

  it('accumulates points correctly for team A and team B', () => {
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 15, teamBPoints: 9 },
      { playerId: 'p2', team: 'B', teamAPoints: 15, teamBPoints: 9 },
    ]
    const rows = computeStandings(players, matches)
    const alice = rows.find((r) => r.playerId === 'p1')!
    const bob = rows.find((r) => r.playerId === 'p2')!
    expect(alice.points).toBe(15)
    expect(bob.points).toBe(9)
  })

  it('counts a win only when the player scored more than the opponent', () => {
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 15, teamBPoints: 9 },  // win
      { playerId: 'p1', team: 'A', teamAPoints: 12, teamBPoints: 12 }, // draw
      { playerId: 'p1', team: 'B', teamAPoints: 14, teamBPoints: 10 }, // loss
    ]
    const rows = computeStandings(players, matches)
    const alice = rows.find((r) => r.playerId === 'p1')!
    expect(alice.wins).toBe(1)
    expect(alice.roundsPlayed).toBe(3)
  })

  it('calculates diff as personal points minus opponent points per match', () => {
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 16, teamBPoints: 8 }, // +8
      { playerId: 'p1', team: 'B', teamAPoints: 14, teamBPoints: 10 }, // -4
    ]
    const rows = computeStandings(players, matches)
    expect(rows.find((r) => r.playerId === 'p1')!.diff).toBe(4)
  })

  it('sorts by points descending first', () => {
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 10, teamBPoints: 14 },
      { playerId: 'p2', team: 'A', teamAPoints: 20, teamBPoints: 4 },
    ]
    const rows = computeStandings(players, matches)
    expect(rows[0].playerId).toBe('p2')
  })

  it('breaks points ties by wins', () => {
    // p1 and p2 same points, p1 has 1 win from one big match, p2 has 0 wins from draws
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 24, teamBPoints: 0 },
      { playerId: 'p1', team: 'A', teamAPoints: 0,  teamBPoints: 24 },
      { playerId: 'p2', team: 'A', teamAPoints: 12, teamBPoints: 12 },
      { playerId: 'p2', team: 'A', teamAPoints: 12, teamBPoints: 12 },
    ]
    const rows = computeStandings(players, matches)
    expect(rows[0].playerId).toBe('p1') // 1 win beats 0 wins
  })

  it('breaks wins ties by diff', () => {
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 13, teamBPoints: 11 }, // win, diff +2
      { playerId: 'p2', team: 'A', teamAPoints: 20, teamBPoints: 4 },  // win, diff +16
    ]
    const rows = computeStandings(players, matches)
    expect(rows[0].playerId).toBe('p2')
  })

  it('assigns the same rank to tied players', () => {
    // p1 and p2 identical stats
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 12, teamBPoints: 12 },
      { playerId: 'p2', team: 'A', teamAPoints: 12, teamBPoints: 12 },
    ]
    const rows = computeStandings(players, matches)
    const r1 = rows.find((r) => r.playerId === 'p1')!
    const r2 = rows.find((r) => r.playerId === 'p2')!
    expect(r1.rank).toBe(r2.rank)
  })

  it('uses dense ranking after a tie — next rank is previous+1, not position+1', () => {
    // p1 and p2 tied at rank 1 → p3 gets rank 2, not 3 (dense ranking)
    const threePlayers = players.slice(0, 3)
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 12, teamBPoints: 12 },
      { playerId: 'p2', team: 'A', teamAPoints: 12, teamBPoints: 12 },
      { playerId: 'p3', team: 'A', teamAPoints: 0,  teamBPoints: 24 },
    ]
    const rows = computeStandings(threePlayers, matches)
    const carol = rows.find((r) => r.playerId === 'p3')!
    expect(carol.rank).toBe(2)
  })

  it('ignores withdrawn players who are not in the players list', () => {
    // Only p1 and p2 passed as active players
    const matches: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 15, teamBPoints: 9 },
      { playerId: 'p3', team: 'B', teamAPoints: 15, teamBPoints: 9 }, // p3 not in list
    ]
    const rows = computeStandings([players[0], players[1]], matches)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.playerId === 'p3')).toBeUndefined()
  })
})
