import { describe, it, expect } from 'vitest'
import { generateRound, type MatchHistoryEntry, type PlayerInput, type CourtInput } from '../algorithms/americano'

function makePlayers(n: number, sitOutCount = 0): PlayerInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, sit_out_count: sitOutCount }))
}

function makeCourts(n: number): CourtInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, court_number: i + 1, name: null }))
}

function allPlayerIdsInRound(result: ReturnType<typeof generateRound>): string[] {
  return result.pairings.flatMap((p) => [...p.team_a, ...p.team_b])
}

describe('generateRound', () => {
  it('produces the right number of matches for the court count', () => {
    const result = generateRound(makePlayers(8), makeCourts(2), [])
    expect(result.pairings).toHaveLength(2)
  })

  it('each match has exactly 2 players per team', () => {
    const result = generateRound(makePlayers(12), makeCourts(3), [])
    for (const p of result.pairings) {
      expect(p.team_a).toHaveLength(2)
      expect(p.team_b).toHaveLength(2)
    }
  })

  it('no player appears in more than one match', () => {
    const result = generateRound(makePlayers(12), makeCourts(3), [])
    const ids = allPlayerIdsInRound(result)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('nobody sits out when players exactly fill all courts', () => {
    const result = generateRound(makePlayers(8), makeCourts(2), [])
    expect(result.sit_out_ids).toHaveLength(0)
  })

  it('correct number of sit-outs when players do not divide evenly', () => {
    // 10 players, 2 courts → 8 play, 2 sit out
    const result = generateRound(makePlayers(10), makeCourts(2), [])
    expect(result.sit_out_ids).toHaveLength(2)
    expect(allPlayerIdsInRound(result)).toHaveLength(8)
  })

  it('sit-out ids and playing ids are disjoint and cover all players', () => {
    const players = makePlayers(10)
    const result = generateRound(players, makeCourts(2), [])
    const playing = new Set(allPlayerIdsInRound(result))
    const sitOut = new Set(result.sit_out_ids)
    for (const id of sitOut) expect(playing.has(id)).toBe(false)
    expect(playing.size + sitOut.size).toBe(players.length)
  })

  it('players with highest sit_out_count are prioritised to play', () => {
    // p1 has sat out 3 times — must play; p2 has sat out 0 — most likely to sit out
    const players: PlayerInput[] = [
      { id: 'p1', sit_out_count: 3 },
      { id: 'p2', sit_out_count: 0 },
      { id: 'p3', sit_out_count: 1 },
      { id: 'p4', sit_out_count: 1 },
      { id: 'p5', sit_out_count: 1 },
    ]
    // 1 court → 4 play, 1 sits out
    // Run many times to guard against shuffle luck
    for (let i = 0; i < 20; i++) {
      const result = generateRound(players, makeCourts(1), [])
      expect(allPlayerIdsInRound(result)).toContain('p1')
      expect(result.sit_out_ids).toContain('p2')
    }
  })

  it('scales down courts when there are not enough players', () => {
    // 3 courts requested but only 8 players → can only fill 2 courts
    const result = generateRound(makePlayers(8), makeCourts(3), [])
    expect(result.pairings).toHaveLength(2)
  })

  it('avoids repeat partners when the only valid pairings are non-repeating', () => {
    // 4 players, 1 court, history blocks p1+p2 and p3+p4.
    // The only valid pairings are {p1+p3, p2+p4} or {p1+p4, p2+p3}.
    // The greedy can never be cornered because p1 always has p3/p4 available
    // and p3 always has p1/p2 available — each player has 2 valid partners.
    const players: PlayerInput[] = [
      { id: 'p1', sit_out_count: 0 },
      { id: 'p2', sit_out_count: 0 },
      { id: 'p3', sit_out_count: 0 },
      { id: 'p4', sit_out_count: 0 },
    ]
    const history: MatchHistoryEntry[] = [
      { team_a: ['p1', 'p2'], team_b: ['p3', 'p4'] },
    ]
    for (let i = 0; i < 50; i++) {
      const result = generateRound(players, makeCourts(1), history)
      const [pairing] = result.pairings
      const onSameTeam = (a: string, b: string, t: string[]) => t.includes(a) && t.includes(b)
      expect(onSameTeam('p1', 'p2', pairing.team_a) || onSameTeam('p1', 'p2', pairing.team_b)).toBe(false)
      expect(onSameTeam('p3', 'p4', pairing.team_a) || onSameTeam('p3', 'p4', pairing.team_b)).toBe(false)
    }
  })

  it('each match is assigned a court object from the courts list', () => {
    const courts = makeCourts(2)
    const result = generateRound(makePlayers(8), courts, [])
    const courtIds = result.pairings.map((p) => p.court.id)
    for (const id of courtIds) {
      expect(courts.map((c) => c.id)).toContain(id)
    }
    expect(new Set(courtIds).size).toBe(courtIds.length)
  })

  it('works with the minimum viable setup (4 players, 1 court)', () => {
    const result = generateRound(makePlayers(4), makeCourts(1), [])
    expect(result.pairings).toHaveLength(1)
    expect(result.sit_out_ids).toHaveLength(0)
    expect(allPlayerIdsInRound(result)).toHaveLength(4)
  })
})
