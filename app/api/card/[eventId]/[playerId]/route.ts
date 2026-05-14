import { NextResponse } from 'next/server'
import { createElement as h } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import satori from 'satori'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, type ScoredMatchEntry } from '@/lib/utils/standings'
import { computeAwardWinners, computeBestPartner, type MatchPlayerEntry } from '@/lib/utils/recap'
import { VOTE_CATEGORIES } from '@/lib/constants/categories'

const W = 1080
const H = 1920

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function loadFont(weight: 400 | 700): Buffer {
  const file = weight === 700 ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf'
  return readFileSync(join(process.cwd(), 'public', 'fonts', file))
}

export async function GET(
  _req: Request,
  { params }: { params: { eventId: string; playerId: string } }
) {
  try {
    const supabase = createClient()

    const { data: event } = await supabase
      .from('events')
      .select('id, name, status, created_at')
      .eq('id', params.eventId)
      .single()

    if (!event || event.status !== 'published') {
      return new NextResponse('Not found', { status: 404 })
    }

    const [{ data: eventPlayers }, { data: completedRounds }, { data: votes }] = await Promise.all([
      supabase.from('event_players').select('player_id, players(id, name)').eq('event_id', params.eventId).eq('withdrawn', false),
      supabase.from('rounds').select('id').eq('event_id', params.eventId).eq('status', 'completed'),
      supabase.from('votes').select('category_id, nominee_player_id').eq('event_id', params.eventId),
    ])

    const players = (eventPlayers ?? []).map((ep) => ({
      id: (ep.players as unknown as { id: string; name: string }).id,
      name: (ep.players as unknown as { id: string; name: string }).name,
    }))

    const player = players.find((p) => p.id === params.playerId)
    if (!player) return new NextResponse('Player not found', { status: 404 })

    const scoredMatches: ScoredMatchEntry[] = []
    const matchEntries: MatchPlayerEntry[] = []
    const roundIds = completedRounds?.map((r) => r.id) ?? []

    if (roundIds.length) {
      const { data: rawMatches } = await supabase
        .from('matches')
        .select('id, match_players(player_id, team), scores(team_a_points, team_b_points)')
        .in('round_id', roundIds)

      for (const m of rawMatches ?? []) {
        const score = m.scores as unknown as { team_a_points: number; team_b_points: number } | null
        if (!score) continue
        for (const mp of (m.match_players as { player_id: string; team: string }[]) ?? []) {
          scoredMatches.push({ playerId: mp.player_id, team: mp.team as 'A' | 'B', teamAPoints: score.team_a_points, teamBPoints: score.team_b_points })
          const teamPoints = mp.team === 'A' ? score.team_a_points : score.team_b_points
          matchEntries.push({ matchId: m.id, playerId: mp.player_id, team: mp.team as 'A' | 'B', teamPoints })
        }
      }
    }

    const standings = computeStandings(players, scoredMatches)
    const awards = computeAwardWinners(players, votes ?? [], VOTE_CATEGORIES)
    const playerRow = standings.find((r) => r.playerId === params.playerId)
    const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]))
    const bestPartner = computeBestPartner(params.playerId, matchEntries, playerNames)
    const playerAwards = awards.filter((cat) => cat.winners.some((w) => w.playerId === params.playerId))
    const totalPlayers = standings.length
    const eventDate = new Date(event.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const [fontRegular, fontBold] = [loadFont(400), loadFont(700)]

    // Conditional hero
    const heroType = playerRow && playerRow.rank <= 3 ? 'rank'
      : playerAwards.length > 0 ? 'award'
      : 'points'

    const heroColor = heroType === 'rank'
      ? (playerRow!.rank === 1 ? '#fbbf24' : playerRow!.rank === 2 ? '#e2e8f0' : '#f97316')
      : heroType === 'award' ? '#c084fc'
      : '#67e8f9'

    let heroEl
    if (heroType === 'rank' && playerRow) {
      const numStr = String(playerRow.rank)
      const suffix = ordinal(playerRow.rank).slice(numStr.length).toUpperCase()
      heroEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('p', { style: { fontSize: 300, fontWeight: 700, color: heroColor, lineHeight: 1, margin: 0, letterSpacing: '-0.04em' } }, numStr),
        h('p', { style: { fontSize: 52, fontWeight: 700, color: heroColor, letterSpacing: '0.2em', margin: 0 } }, `${suffix} PLACE`),
        h('p', { style: { fontSize: 28, color: 'rgba(255,255,255,0.35)', margin: '16px 0 0' } }, `out of ${totalPlayers} players`),
      )
    } else if (heroType === 'award' && playerAwards.length > 0) {
      const award = playerAwards[0]
      const desc = VOTE_CATEGORIES.find((c) => c.id === award.id)?.description
      heroEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 28 } },
        h('p', { style: { fontSize: 24, fontWeight: 700, color: heroColor, letterSpacing: '0.2em', margin: 0 } }, 'VOTED'),
        h('p', { style: { fontSize: 156, fontWeight: 700, color: '#f8fafc', lineHeight: 1.0, margin: 0 } }, award.name),
        desc ? h('p', { style: { fontSize: 36, color: 'rgba(255,255,255,0.5)', margin: 0 } }, desc) : null,
      )
    } else {
      heroEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('p', { style: { fontSize: 280, fontWeight: 700, color: heroColor, lineHeight: 1, margin: 0, letterSpacing: '-0.04em' } }, String(playerRow?.points ?? 0)),
        h('p', { style: { fontSize: 52, fontWeight: 700, color: heroColor, letterSpacing: '0.2em', margin: 0 } }, 'POINTS'),
        playerRow ? h('p', { style: { fontSize: 28, color: 'rgba(255,255,255,0.35)', margin: '16px 0 0' } }, `${ordinal(playerRow.rank)} of ${totalPlayers} players`) : null,
      )
    }

    // Awards below stats (skip the one used as hero)
    const remainingAwards = heroType === 'award' ? playerAwards.slice(1) : playerAwards

    const stat = (label: string, value: string) =>
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flex: '1' } },
        h('p', { style: { fontSize: 80, fontWeight: 700, margin: 0, color: '#f8fafc', lineHeight: 1 } }, value),
        h('p', { style: { fontSize: 18, color: 'rgba(255,255,255,0.3)', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' } }, label),
      )

    const divider = h('div', { style: { display: 'flex', width: '100%', height: 1, background: 'rgba(255,255,255,0.08)' } })

    const card = h('div', {
      style: {
        width: W, height: H,
        background: 'linear-gradient(160deg, #0a0015 0%, #1a0a3e 28%, #3b0764 58%, #6d28d9 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '80px 80px 80px',
        fontFamily: 'Inter',
      },
    },
      // TOP HALF — branding pinned top, hero + name pinned to divider
      h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 72 } },
        // Branding
        h('p', { style: { fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.2)', margin: 0, letterSpacing: '0.14em' } }, 'AMERICANIFY'),
        // Hero + name anchored to bottom of top half
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 28 } },
          h('div', { style: { display: 'flex' } }, heroEl),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('p', { style: { fontSize: 96, fontWeight: 700, margin: 0, color: '#f8fafc', lineHeight: 1, letterSpacing: '-0.02em' } }, player.name),
            heroType !== 'rank' && playerRow
              ? h('p', { style: { fontSize: 30, color: 'rgba(255,255,255,0.35)', margin: 0 } }, `${ordinal(playerRow.rank)} of ${totalPlayers} players`)
              : null,
          ),
        ),
      ),

      divider,

      // BOTTOM HALF — stats pinned top, awards+partner in middle, footer pinned bottom
      h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingTop: 72 } },
        // Stats row
        playerRow
          ? h('div', { style: { display: 'flex', alignItems: 'flex-start' } },
              stat('Points', String(playerRow.points)),
              stat('Wins', String(playerRow.wins)),
              stat('Diff', (playerRow.diff > 0 ? '+' : '') + playerRow.diff),
            )
          : h('div', { style: { display: 'flex' } }),

        // Awards + best partner (centered in remaining space)
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 48 } },
          remainingAwards.length > 0
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
                ...remainingAwards.map((cat) =>
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 18 } },
                    h('div', { style: { display: 'flex', width: 10, height: 10, borderRadius: 5, background: '#7c3aed' } }),
                    h('p', { style: { fontSize: 32, fontWeight: 600, margin: 0, color: '#e2e8f0' } }, cat.name),
                  )
                )
              )
            : null,

          bestPartner
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                h('p', { style: { fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.3)', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Best partner'),
                h('p', { style: { fontSize: 52, fontWeight: 700, margin: 0, color: '#f8fafc', lineHeight: 1.1 } }, bestPartner.name),
                h('p', { style: { fontSize: 28, color: 'rgba(255,255,255,0.4)', margin: 0 } }, `${bestPartner.combinedPoints} pts together`),
              )
            : null,
        ),

        // Footer
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } },
          h('p', { style: { fontSize: 18, fontWeight: 600, margin: 0, color: 'rgba(255,255,255,0.25)' } }, event.name),
          h('p', { style: { fontSize: 14, margin: 0, color: 'rgba(255,255,255,0.15)' } }, eventDate),
        ),
      ),
    )

    const svg = await satori(card, {
      width: W,
      height: H,
      fonts: [
        { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
      ],
    })

    const png = await sharp(Buffer.from(svg)).png().toBuffer()

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[card]', err)
    return new NextResponse(String(err), { status: 500 })
  }
}
