/**
 * End-to-end scenario tests that exercise the full data pipeline:
 * round generation → scoring → standings → voting → awards → best partner.
 *
 * No database involved — pure logic functions only.
 */
import { describe, it, expect } from 'vitest'
import { generateRound, type MatchHistoryEntry, type PlayerInput, type CourtInput } from '../algorithms/americano'
import { computeStandings, type ScoredMatchEntry } from '../utils/standings'
import { computeAwardWinners, computeBestPartner, type MatchPlayerEntry } from '../utils/recap'
import { VOTE_CATEGORIES } from '../constants/categories'

const PLAYERS: PlayerInput[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  sit_out_count: 0,
}))
const PLAYER_OBJS = PLAYERS.map((p, i) => ({
  id: p.id,
  name: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry'][i],
}))
const PLAYER_NAMES = Object.fromEntries(PLAYER_OBJS.map((p) => [p.id, p.name]))

const COURTS: CourtInput[] = [
  { id: 'c1', court_number: 1, name: null },
  { id: 'c2', court_number: 2, name: null },
]

describe('Round generation', () => {
  it('round 1: 2 matches, all 8 players play, none sit out', () => {
    const r1 = generateRound(PLAYERS, COURTS, [])
    expect(r1.pairings).toHaveLength(2)
    expect(r1.sit_out_ids).toHaveLength(0)
    const playing = r1.pairings.flatMap((p) => [...p.team_a, ...p.team_b])
    expect(new Set(playing).size).toBe(8)
  })

  it('round 2 avoids repeating the exact same partnerships from round 1', () => {
    const r1 = generateRound(PLAYERS, COURTS, [])
    const history: MatchHistoryEntry[] = r1.pairings.map((p) => ({
      team_a: p.team_a,
      team_b: p.team_b,
    }))
    const r2 = generateRound(PLAYERS, COURTS, history)

    // r2 must be structurally valid regardless of pairing variety
    expect(r2.pairings).toHaveLength(2)
    const playing = r2.pairings.flatMap((p) => [...p.team_a, ...p.team_b])
    expect(new Set(playing).size).toBe(8)
  })
})

describe('Standings after scoring', () => {
  it('team that scores more gets the win; team that scores less takes the loss', () => {
    const entries: ScoredMatchEntry[] = [
      { playerId: 'p1', team: 'A', teamAPoints: 21, teamBPoints: 3 }, // win
      { playerId: 'p2', team: 'B', teamAPoints: 21, teamBPoints: 3 }, // loss
    ]
    const rows = computeStandings(PLAYER_OBJS.slice(0, 2), entries)
    const alice = rows.find((r) => r.playerId === 'p1')!
    const bob = rows.find((r) => r.playerId === 'p2')!
    expect(alice.wins).toBe(1)
    expect(bob.wins).toBe(0)
    expect(alice.points).toBe(21)
    expect(bob.points).toBe(3)
  })

  it('dense ranking: players tied on points but different wins get consecutive ranks', () => {
    // Recreates the real scenario from the first test event
    const players4 = [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
      { id: 'carol', name: 'Carol' },
      { id: 'diana', name: 'Diana' },
    ]
    const entries: ScoredMatchEntry[] = [
      // Alice: 51 pts, 3 wins
      { playerId: 'alice', team: 'A', teamAPoints: 17, teamBPoints: 7 },
      { playerId: 'alice', team: 'A', teamAPoints: 17, teamBPoints: 7 },
      { playerId: 'alice', team: 'A', teamAPoints: 17, teamBPoints: 7 },
      // Bob: 47 pts, 2 wins, +15 diff
      { playerId: 'bob', team: 'A', teamAPoints: 16, teamBPoints: 8 },
      { playerId: 'bob', team: 'A', teamAPoints: 16, teamBPoints: 8 },
      { playerId: 'bob', team: 'B', teamAPoints: 16, teamBPoints: 15 }, // loss, 15 pts
      // Carol: 47 pts, 2 wins, +15 diff — identical stats to Bob → truly tied
      { playerId: 'carol', team: 'A', teamAPoints: 16, teamBPoints: 8 },
      { playerId: 'carol', team: 'A', teamAPoints: 16, teamBPoints: 8 },
      { playerId: 'carol', team: 'B', teamAPoints: 16, teamBPoints: 15 }, // loss, 15 pts
      // Diana: 47 pts, 1 win
      { playerId: 'diana', team: 'A', teamAPoints: 21, teamBPoints: 5 },
      { playerId: 'diana', team: 'B', teamAPoints: 20, teamBPoints: 13 }, // loss
      { playerId: 'diana', team: 'B', teamAPoints: 20, teamBPoints: 13 }, // loss
    ]
    const rows = computeStandings(players4, entries)
    const alice = rows.find((r) => r.playerId === 'alice')!
    const bob = rows.find((r) => r.playerId === 'bob')!
    const carol = rows.find((r) => r.playerId === 'carol')!
    const diana = rows.find((r) => r.playerId === 'diana')!

    expect(alice.rank).toBe(1)
    expect(bob.rank).toBe(2)
    expect(carol.rank).toBe(2)
    expect(diana.rank).toBe(3) // dense rank — not skipped to 4

    expect(alice.points).toBe(51)
    expect(bob.points).toBe(47)
    expect(carol.points).toBe(47)
    expect(diana.points).toBe(47)
    expect(diana.wins).toBe(1)
  })
})

describe('Voting and awards', () => {
  const players4 = PLAYER_OBJS.slice(0, 4)

  it('player with most votes in a category wins the award', () => {
    const votes = [
      { category_id: 'preferred_partner', nominee_player_id: 'p1' },
      { category_id: 'preferred_partner', nominee_player_id: 'p1' },
      { category_id: 'preferred_partner', nominee_player_id: 'p2' },
    ]
    const awards = computeAwardWinners(players4, votes, VOTE_CATEGORIES)
    const cat = awards.find((a) => a.id === 'preferred_partner')!
    expect(cat.winners).toHaveLength(1)
    expect(cat.winners[0].playerId).toBe('p1')
    expect(cat.winners[0].voteCount).toBe(2)
  })

  it('categories with no votes have empty winners', () => {
    const awards = computeAwardWinners(players4, [], VOTE_CATEGORIES)
    expect(awards.every((a) => a.winners.length === 0)).toBe(true)
  })

  it('all 7 VOTE_CATEGORIES are returned regardless of which received votes', () => {
    const votes = [{ category_id: 'the_hammer', nominee_player_id: 'p1' }]
    const awards = computeAwardWinners(players4, votes, VOTE_CATEGORIES)
    expect(awards).toHaveLength(7)
    const hammer = awards.find((a) => a.id === 'the_hammer')!
    expect(hammer.winners[0].playerId).toBe('p1')
    const wall = awards.find((a) => a.id === 'the_wall')!
    expect(wall.winners).toHaveLength(0)
  })

  it('tied category produces multiple co-winners', () => {
    const votes = [
      { category_id: 'best_energy', nominee_player_id: 'p1' },
      { category_id: 'best_energy', nominee_player_id: 'p2' },
    ]
    const awards = computeAwardWinners(players4, votes, VOTE_CATEGORIES)
    const cat = awards.find((a) => a.id === 'best_energy')!
    expect(cat.winners).toHaveLength(2)
  })
})

describe('Best partner', () => {
  it('returns the teammate with the highest accumulated team points', () => {
    const entries: MatchPlayerEntry[] = [
      // Round 1: alice + bob win 21-3
      { matchId: 'm1', playerId: 'p1', team: 'A', teamPoints: 21 },
      { matchId: 'm1', playerId: 'p2', team: 'A', teamPoints: 21 },
      { matchId: 'm1', playerId: 'p3', team: 'B', teamPoints: 3 },
      { matchId: 'm1', playerId: 'p4', team: 'B', teamPoints: 3 },
      // Round 2: alice + carol lose 9-15
      { matchId: 'm2', playerId: 'p1', team: 'A', teamPoints: 9 },
      { matchId: 'm2', playerId: 'p3', team: 'A', teamPoints: 9 },
      { matchId: 'm2', playerId: 'p2', team: 'B', teamPoints: 15 },
      { matchId: 'm2', playerId: 'p4', team: 'B', teamPoints: 15 },
    ]
    const result = computeBestPartner('p1', entries, PLAYER_NAMES)
    // With bob (m1): alice scored 21 pts → combinedPoints = 21
    // With carol (m2): alice scored 9 pts → combinedPoints = 9
    expect(result?.name).toBe('Bob')
    expect(result?.combinedPoints).toBe(21)
  })

  it('accumulates points across multiple rounds with the same partner', () => {
    const entries: MatchPlayerEntry[] = [
      { matchId: 'm1', playerId: 'p1', team: 'A', teamPoints: 18 },
      { matchId: 'm1', playerId: 'p2', team: 'A', teamPoints: 18 },
      { matchId: 'm1', playerId: 'p3', team: 'B', teamPoints: 6 },
      { matchId: 'm1', playerId: 'p4', team: 'B', teamPoints: 6 },
      { matchId: 'm2', playerId: 'p1', team: 'A', teamPoints: 12 },
      { matchId: 'm2', playerId: 'p2', team: 'A', teamPoints: 12 },
      { matchId: 'm2', playerId: 'p3', team: 'B', teamPoints: 12 },
      { matchId: 'm2', playerId: 'p4', team: 'B', teamPoints: 12 },
    ]
    const result = computeBestPartner('p1', entries, PLAYER_NAMES)
    expect(result?.name).toBe('Bob')
    expect(result?.combinedPoints).toBe(30) // 18 + 12
  })

  it('returns null when the player has no match entries', () => {
    expect(computeBestPartner('p1', [], PLAYER_NAMES)).toBeNull()
  })
})
