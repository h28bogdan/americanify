import { describe, it, expect } from 'vitest'
import { computeAwardWinners, computeBestPartner, type MatchPlayerEntry } from '../utils/recap'

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
  { id: 'p4', name: 'Dave' },
]

const categories = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
]

describe('computeAwardWinners', () => {
  it('returns empty winners when no votes cast', () => {
    const result = computeAwardWinners(players, [], categories)
    expect(result.every((r) => r.winners.length === 0)).toBe(true)
  })

  it('returns the player with the most votes as winner', () => {
    const votes = [
      { category_id: 'mvp', nominee_player_id: 'p1' },
      { category_id: 'mvp', nominee_player_id: 'p1' },
      { category_id: 'mvp', nominee_player_id: 'p2' },
    ]
    const result = computeAwardWinners(players, votes, categories)
    const mvp = result.find((r) => r.id === 'mvp')!
    expect(mvp.winners).toHaveLength(1)
    expect(mvp.winners[0].playerId).toBe('p1')
    expect(mvp.winners[0].voteCount).toBe(2)
  })

  it('returns all tied players as co-winners', () => {
    const votes = [
      { category_id: 'mvp', nominee_player_id: 'p1' },
      { category_id: 'mvp', nominee_player_id: 'p2' },
    ]
    const result = computeAwardWinners(players, votes, categories)
    const mvp = result.find((r) => r.id === 'mvp')!
    expect(mvp.winners).toHaveLength(2)
    expect(mvp.winners.map((w) => w.playerId).sort()).toEqual(['p1', 'p2'])
  })

  it('handles votes across multiple categories independently', () => {
    const votes = [
      { category_id: 'mvp', nominee_player_id: 'p1' },
      { category_id: 'mvp', nominee_player_id: 'p1' },
      { category_id: 'best_energy', nominee_player_id: 'p3' },
    ]
    const result = computeAwardWinners(players, votes, categories)
    expect(result.find((r) => r.id === 'mvp')!.winners[0].playerId).toBe('p1')
    expect(result.find((r) => r.id === 'best_energy')!.winners[0].playerId).toBe('p3')
  })
})

describe('computeBestPartner', () => {
  it('returns null when the player has no match entries', () => {
    expect(computeBestPartner('p1', [], { p1: 'Alice', p2: 'Bob' })).toBeNull()
  })

  it('returns the partner with the highest combined points', () => {
    const entries: MatchPlayerEntry[] = [
      // Match 1: p1 + p2 scored 18
      { matchId: 'm1', playerId: 'p1', team: 'A', teamPoints: 18 },
      { matchId: 'm1', playerId: 'p2', team: 'A', teamPoints: 18 },
      { matchId: 'm1', playerId: 'p3', team: 'B', teamPoints: 6 },
      { matchId: 'm1', playerId: 'p4', team: 'B', teamPoints: 6 },
      // Match 2: p1 + p3 scored 10
      { matchId: 'm2', playerId: 'p1', team: 'A', teamPoints: 10 },
      { matchId: 'm2', playerId: 'p3', team: 'A', teamPoints: 10 },
      { matchId: 'm2', playerId: 'p2', team: 'B', teamPoints: 14 },
      { matchId: 'm2', playerId: 'p4', team: 'B', teamPoints: 14 },
    ]
    const names = { p1: 'Alice', p2: 'Bob', p3: 'Carol', p4: 'Dave' }
    const result = computeBestPartner('p1', entries, names)
    expect(result?.name).toBe('Bob')
    expect(result?.combinedPoints).toBe(18)
  })

  it('accumulates points across multiple rounds with the same partner', () => {
    const entries: MatchPlayerEntry[] = [
      { matchId: 'm1', playerId: 'p1', team: 'A', teamPoints: 15 },
      { matchId: 'm1', playerId: 'p2', team: 'A', teamPoints: 15 },
      { matchId: 'm1', playerId: 'p3', team: 'B', teamPoints: 9 },
      { matchId: 'm1', playerId: 'p4', team: 'B', teamPoints: 9 },
      { matchId: 'm2', playerId: 'p1', team: 'A', teamPoints: 20 },
      { matchId: 'm2', playerId: 'p2', team: 'A', teamPoints: 20 },
      { matchId: 'm2', playerId: 'p3', team: 'B', teamPoints: 4 },
      { matchId: 'm2', playerId: 'p4', team: 'B', teamPoints: 4 },
    ]
    const names = { p1: 'Alice', p2: 'Bob', p3: 'Carol', p4: 'Dave' }
    const result = computeBestPartner('p1', entries, names)
    expect(result?.name).toBe('Bob')
    expect(result?.combinedPoints).toBe(35) // 15 + 20
  })

  it('returns null when the partner name is not in the names map', () => {
    const entries: MatchPlayerEntry[] = [
      { matchId: 'm1', playerId: 'p1', team: 'A', teamPoints: 15 },
      { matchId: 'm1', playerId: 'p_unknown', team: 'A', teamPoints: 15 },
    ]
    expect(computeBestPartner('p1', entries, { p1: 'Alice' })).toBeNull()
  })
})
