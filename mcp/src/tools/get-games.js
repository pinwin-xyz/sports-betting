// src/tools/get-games.js — MCP tool: get_games

const { getMarketName, getSelectionName } = require('@azuro-org/dictionaries')
const { postJson } = require('../http')
const { DATAFEED_HOST, DATAFEED_PATH, MAIN_MARKET_NAMES, SPORT_SLUG_ALIASES } = require('../constants')

async function getGames({ sport, league, count = 20 }) {
  const sportSlug = sport
    ? (SPORT_SLUG_ALIASES[sport.toLowerCase()] || sport.toLowerCase())
    : null

  const whereParts = ['state_in: ["Prematch", "Live"]']
  if (sportSlug) whereParts.push(`sport_: { slug: "${sportSlug}" }`)
  if (league)    whereParts.push(`league_: { slug: "${league.toLowerCase()}" }`)

  const query = `{
    games(first: ${count}, where: { ${whereParts.join(', ')} }, orderBy: turnover, orderDirection: desc) {
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

  const res = await postJson(DATAFEED_HOST, DATAFEED_PATH, { query })
  if (res.errors) throw new Error('Subgraph error: ' + JSON.stringify(res.errors))

  const games  = res.data?.games || []
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
      const label = sel === '1' ? (game.participants[0]?.name || 'Team 1')
                  : sel === '2' ? (game.participants[1]?.name || 'Team 2')
                  : 'Draw'
      return {
        label,
        odds:        parseFloat(o.currentOdds).toFixed(2),
        outcomeId:   o.outcomeId,
        conditionId: mainCond.conditionId,
      }
    })

    const kickoff = new Date(parseInt(game.startsAt) * 1000)
      .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

    results.push({
      gameId:    game.gameId,
      title:     game.title,
      state:     game.state,
      kickoff,
      startsAt:  parseInt(game.startsAt),
      sport:     game.sport.name,
      league:    game.league.name,
      market:    mainMarketName,
      selections,
    })
  }

  if (results.length === 0) {
    return { text: 'No games with active main market found for the given filters.', games: [] }
  }

  // Build human-readable output
  let text = ''
  let currentSport = ''
  results.forEach((g, i) => {
    if (g.sport !== currentSport) {
      currentSport = g.sport
      text += `\n${g.sport} — ${g.league}\n`
    }
    const status   = g.state === 'Live' ? '[LIVE 🔴]' : `[Prematch, ${g.kickoff}]`
    const oddsLine = g.selections.map(s => `${s.label} ${s.odds}`).join(' | ')
    text += `${i + 1}. ${g.title}  ${status}\n`
    text += `   ${g.market}: ${oddsLine}\n`
  })

  return { text: text.trim(), games: results }
}

module.exports = { getGames }
