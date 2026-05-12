import { NextResponse } from 'next/server'
import { createElement as h } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import satori from 'satori'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { computeStandings, type ScoredMatchEntry } from '@/lib/utils/standings'
import { computeAwardWinners, computeBestPartner, type MatchPlayerEntry } from '@/lib/utils/recap'

const W = 1080
const H = 1350

const PUBLIC_CATEGORIES = [
  { id: 'mvp', name: 'MVP' },
  { id: 'best_energy', name: 'Best Energy' },
  { id: 'preferred_partner', name: 'Preferred Partner' },
  { id: 'toughest_opponent', name: 'Toughest Opponent' },
]

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
    const awards = computeAwardWinners(players, votes ?? [], PUBLIC_CATEGORIES)
    const playerRow = standings.find((r) => r.playerId === params.playerId)
    const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]))
    const bestPartner = computeBestPartner(params.playerId, matchEntries, playerNames)
    const playerAwards = awards.filter((cat) => cat.winners.some((w) => w.playerId === params.playerId))
    const totalPlayers = standings.length
    const eventDate = new Date(event.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const [fontRegular, fontBold] = [loadFont(400), loadFont(700)]

    const divider = h('div', {
      style: { display: 'flex', width: '100%', height: 1, background: '#1e293b', marginTop: 0 },
    })

    const stat = (label: string, value: string) =>
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '1' } },
        h('p', { style: { fontSize: 52, fontWeight: 700, margin: 0, color: '#f8fafc', lineHeight: 1 } }, value),
        h('p', { style: { fontSize: 16, color: '#475569', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' } }, label),
      )

    const card = h('div', {
      style: {
        width: W, height: H,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        padding: '72px 72px 64px',
        fontFamily: 'Inter',
      },
    },
      // Branding
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80 } },
        h('p', { style: { fontSize: 18, fontWeight: 700, color: '#334155', margin: 0, letterSpacing: '0.1em' } }, 'AMERICANIFY'),
        h('p', { style: { fontSize: 16, color: '#334155', margin: 0 } }, 'Americano'),
      ),

      // Player name — centrepiece
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 72 } },
        h('p', { style: { fontSize: 88, fontWeight: 700, margin: 0, color: '#f8fafc', lineHeight: 1, letterSpacing: '-0.02em' } }, player.name),
        playerRow
          ? h('p', { style: { fontSize: 26, color: '#64748b', margin: 0 } },
              `${ordinal(playerRow.rank)} place · ${totalPlayers} players`)
          : null,
      ),

      divider,

      // Stats row
      playerRow
        ? h('div', { style: { display: 'flex', alignItems: 'flex-start', padding: '56px 0', gap: 0 } },
            stat('Points', String(playerRow.points)),
            stat('Wins', String(playerRow.wins)),
            stat('Diff', (playerRow.diff > 0 ? '+' : '') + playerRow.diff),
          )
        : null,

      divider,

      // Awards
      playerAwards.length > 0
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 52 } },
            ...playerAwards.map((cat) =>
              h('div', {
                key: cat.id,
                style: { display: 'flex', alignItems: 'center', gap: 16 },
              },
                h('div', { style: { display: 'flex', width: 8, height: 8, borderRadius: 4, background: '#38bdf8' } }),
                h('p', { style: { fontSize: 22, fontWeight: 600, margin: 0, color: '#e2e8f0' } }, cat.name),
              )
            )
          )
        : null,

      // Spacer pushes partner to bottom
      h('div', { style: { display: 'flex', flex: 1 } }),

      // Best partner + event
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' } },
        bestPartner
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              h('p', { style: { fontSize: 14, color: '#334155', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' } }, 'Best partner'),
              h('p', { style: { fontSize: 22, fontWeight: 600, margin: 0, color: '#94a3b8' } }, `${bestPartner.name} · ${bestPartner.combinedPoints} pts`),
            )
          : h('div', { style: { display: 'flex' } }),
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } },
          h('p', { style: { fontSize: 15, fontWeight: 600, margin: 0, color: '#475569' } }, event.name),
          h('p', { style: { fontSize: 13, color: '#334155', margin: 0 } }, eventDate),
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
