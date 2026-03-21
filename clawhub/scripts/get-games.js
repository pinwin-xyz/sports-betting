#!/usr/bin/env node
// get-games.js — fetch games from Azuro data-feed and display main market odds
// Usage: node get-games.js [sport-slug] [league-slug] [count]
// Examples:
//   node get-games.js                        # top 20 games all sports
//   node get-games.js basketball nba 10      # NBA only
//   node get-games.js football premier-league 10

const { getMarketName, getSelectionName } = require('@azuro-org/dictionaries')
const https = require('https')

const MAIN_MARKET_NAMES = new Set([
  'Match Winner',
  'Full Time Result',
  'Winner',
  'Fight Winner',
  'Whole game - Full time result Goal',
])

// Azuro uses different slugs than what users naturally type.
const SPORT_SLUG_ALIASES = {
  'hockey':             'ice-hockey',
  'nhl':                'ice-hockey',
  'ice-hockey':         'ice-hockey',
  'icehockey':          'ice-hockey',
  'soccer':             'football',
  'basketball':         'basketball',
  'nba':                'basketball',
  'mma':                'mma',
  'baseball':           'baseball',
  'mlb':                'baseball',
  'american-football':  'american-football',
  'nfl':                'american-football',
}

const DATAFEED_HOST = 'thegraph-1.onchainfeed.org'
const DATAFEED_PATH = '/subgraphs/name/azuro-protocol/azuro-data-feed-polygon'

const [,, sportSlugRaw, leagueSlug, countArg] = process.argv
const sportSlug = sportSlugRaw ? (SPORT_SLUG_ALIASES[sportSlugRaw.toLowerCase()] || sportSlugRaw.toLowerCase()) : null
const first = parseInt(countArg) || 20

const whereParts = ['state_in: ["Prematch", "Live"]']
if (sportSlug)  whereParts.push(`sport_: { slug: "${sportSlug}" }`)
if (leagueSlug) whereParts.push(`league_: { slug: "${leagueSlug}" }`)

const graphqlQuery = `{
  games(first: ${first}, where: { ${whereParts.join(', ')} }, orderBy: turnover, orderDirection: desc) {
    gameId title state startsAt
    sport { name }
    league { name }
    participants { name }
    conditions(where: { state: Active }) {
      conditionId
      outcomes { outcomeId currentOdds }
    }
  }
}`

const body = Buffer.from(JSON.stringify({ query: graphqlQuery }))

const req = https.request({
  hostname: DATAFEED_HOST,
  path: DATAFEED_PATH,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
}, res => {
  let raw = ''
  res.on('data', c => { raw += c })
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw)
      if (parsed.errors) { console.error('GraphQL errors:', JSON.stringify(parsed.errors)); process.exit(1) }
      const games = parsed.data && parsed.data.games ? parsed.data.games : []

      const results = []
      for (const game of games) {
        let mainCond = null
        let mainMarketName = null
        for (const cond of game.conditions) {
          if (!cond.outcomes.length) continue
          try {
            const name = getMarketName({ outcomeId: cond.outcomes[0].outcomeId })
            if (MAIN_MARKET_NAMES.has(name)) { mainCond = cond; mainMarketName = name; break }
          } catch (_) {}
        }
        if (!mainCond) continue

        const selections = mainCond.outcomes.map(o => {
          let sel
          try { sel = getSelectionName({ outcomeId: o.outcomeId, withPoint: true }) } catch (_) { sel = String(o.outcomeId) }
          const label = sel === '1' ? (game.participants[0] && game.participants[0].name || 'Team 1')
                      : sel === '2' ? (game.participants[1] && game.participants[1].name || 'Team 2')
                      : 'Draw'
          return { label, odds: parseFloat(o.currentOdds).toFixed(2), outcomeId: o.outcomeId, conditionId: mainCond.conditionId }
        })

        const kickoff = new Date(parseInt(game.startsAt) * 1000)
          .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

        results.push({ gameId: game.gameId, title: game.title, state: game.state, kickoff, startsAt: parseInt(game.startsAt), sport: game.sport.name, league: game.league.name, market: mainMarketName, selections })
      }

      if (results.length === 0) { console.log('No games with active main market found.'); process.exit(0) }

      let currentSport = ''
      results.forEach((g, i) => {
        if (g.sport !== currentSport) { currentSport = g.sport; console.log('\n' + g.sport + ' — ' + g.league) }
        const status = g.state === 'Live' ? '[LIVE 🔴]' : '[Prematch, ' + g.kickoff + ']'
        const oddsLine = g.selections.map(s => s.label + ' ' + s.odds).join(' | ')
        console.log((i + 1) + '. ' + g.title + '  ' + status)
        console.log('   ' + g.market + ': ' + oddsLine)
      })

      console.log('\n---JSON---')
      console.log(JSON.stringify(results))

    } catch (e) { console.error('Failed to parse response:', e.message); process.exit(1) }
  })
})
req.on('error', e => { console.error('Request failed:', e.message); process.exit(1) })
req.write(body)
req.end()
