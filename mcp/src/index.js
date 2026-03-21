#!/usr/bin/env node
// src/index.js — Pinwin MCP Server
//
// Exposes 4 tools to any MCP-compatible LLM (Claude, GPT, etc.):
//   get_games    — fetch upcoming/live games with odds
//   place_bet    — place a bet on Azuro/Polygon via Pinwin
//   check_bets   — check bet history and claimable winnings
//   claim_bets   — redeem won/canceled bets on-chain
//
// Setup (claude_desktop_config.json):
// {
//   "mcpServers": {
//     "pinwin": {
//       "command": "npx",
//       "args": ["pinwin-mcp"],
//       "env": { "BETTOR_PRIVATE_KEY": "0x..." }
//     }
//   }
// }

const { McpServer }             = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport }  = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z }                     = require('zod')

const { getGames }            = require('./tools/get-games')
const { placeBet }            = require('./tools/place-bet')
const { checkBets, claimBets } = require('./tools/bets')

// ─── Server ───────────────────────────────────────────────────────────────────
const server = new McpServer({
  name:    'pinwin',
  version: '1.0.0',
})

// ─── Tool: get_games ──────────────────────────────────────────────────────────
server.tool(
  'get_games',
  'Fetch upcoming and live sports games with main market odds from Azuro/Pinwin. Returns a human-readable list and structured JSON with conditionId/outcomeId needed to place bets.',
  {
    sport: z.string().optional().describe(
      'Sport filter. Accepts common aliases: nba/basketball, nhl/hockey/ice-hockey, nfl/american-football, mlb/baseball, football/soccer, tennis, mma. Leave empty for all sports.'
    ),
    league: z.string().optional().describe(
      'League slug filter, e.g. "nba", "premier-league", "nhl". Leave empty for all leagues of the sport.'
    ),
    count: z.number().optional().describe(
      'Number of games to return (default: 20, max: 50).'
    ),
  },
  async ({ sport, league, count }) => {
    try {
      const result = await getGames({ sport, league, count: Math.min(count || 20, 50) })
      return {
        content: [
          { type: 'text', text: result.text },
          { type: 'text', text: '\n\n---GAMES_JSON---\n' + JSON.stringify(result.games) },
        ],
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `❌ Error: ${e.message}` }], isError: true }
    }
  }
)

// ─── Tool: place_bet ──────────────────────────────────────────────────────────
server.tool(
  'place_bet',
  'Place a decentralized sports bet on Azuro/Polygon via Pinwin. Uses the wallet configured via BETTOR_PRIVATE_KEY. IMPORTANT: always confirm with the user before calling this tool — it executes a real on-chain transaction with real money.',
  {
    conditionId: z.string().describe(
      'The conditionId from get_games output. Must be taken from the ---GAMES_JSON--- block, not guessed.'
    ),
    outcomeId: z.number().describe(
      'The outcomeId from get_games output for the chosen selection. Must be taken from the ---GAMES_JSON--- block.'
    ),
    stake: z.number().describe(
      'Stake amount in USDT (e.g. 1.5 for 1.5 USDT). Minimum 1 USDT recommended.'
    ),
    startsAt: z.number().optional().describe(
      'Unix timestamp of game kickoff from get_games output. Used to schedule automatic result notification.'
    ),
    match: z.string().optional().describe(
      'Human-readable match title, e.g. "Boston Celtics vs Memphis Grizzlies". Used in result notification.'
    ),
  },
  async ({ conditionId, outcomeId, stake, startsAt, match }) => {
    try {
      const result = await placeBet({ conditionId, outcomeId, stake, startsAt, match })

      let text = ''
      if (result.lowPolWarning) text += result.lowPolWarning
      if (result.approvalTx)    text += `✅ USDT approved: ${result.approvalTx}\n\n`

      text += [
        `✅ Bet confirmed on-chain!`,
        ``,
        `🏟  Match:     ${result.match}`,
        `🎯  Market:    ${result.market} — outcome "${result.selection}"`,
        `📊  Odds:      ${result.odds}`,
        `💰  Stake:     ${result.stake} USDT`,
        `🎁  Potential: ${result.payout} USDT`,
        `🔗  Tx:        ${result.polygonscan}`,
      ].join('\n')

      if (result.startsAt) {
        const checkTime = new Date((result.startsAt + 2 * 3600) * 1000)
          .toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
        text += `\n\n👁  Result check scheduled for ~${checkTime} (kickoff + 2h)`
      }

      return {
        content: [
          { type: 'text', text },
          { type: 'text', text: '\n\n---BET_JSON---\n' + JSON.stringify(result) },
        ],
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `❌ Error: ${e.message}` }], isError: true }
    }
  }
)

// ─── Tool: check_bets ────────────────────────────────────────────────────────
server.tool(
  'check_bets',
  'Check the bet history and status for the configured wallet. Shows pending, won, lost, and claimable bets. Call this proactively when the user starts a conversation to surface any pending claims.',
  {
    limit: z.number().optional().describe('Number of recent bets to return (default: 20).'),
    onlyRedeemable: z.boolean().optional().describe('If true, return only bets that are ready to claim.'),
  },
  async ({ limit, onlyRedeemable }) => {
    try {
      const result = await checkBets({ limit: limit || 20, onlyRedeemable: onlyRedeemable || false })
      return {
        content: [
          { type: 'text', text: result.text },
          { type: 'text', text: '\n\n---BETS_JSON---\n' + JSON.stringify(result.bets) },
        ],
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `❌ Error: ${e.message}` }], isError: true }
    }
  }
)

// ─── Tool: claim_bets ────────────────────────────────────────────────────────
server.tool(
  'claim_bets',
  'Redeem won or canceled bets on-chain. Sends a transaction to the Azuro ClientCore contract on Polygon. IMPORTANT: always confirm with the user before calling this tool.',
  {
    betIds: z.array(z.number()).describe(
      'Array of on-chain betId numbers to claim. Get these from check_bets (redeemableBetIds field).'
    ),
  },
  async ({ betIds }) => {
    try {
      const result = await claimBets({ betIds })
      const text = [
        `✅ Winnings claimed!`,
        ``,
        `🎯  Bet IDs: ${result.betIds.join(', ')}`,
        `🔗  Tx:      ${result.polygonscan}`,
      ].join('\n')

      return {
        content: [
          { type: 'text', text },
          { type: 'text', text: '\n\n---CLAIM_JSON---\n' + JSON.stringify(result) },
        ],
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `❌ Error: ${e.message}` }], isError: true }
    }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.BETTOR_PRIVATE_KEY) {
    process.stderr.write(
      '[pinwin-mcp] ERROR: BETTOR_PRIVATE_KEY environment variable is not set.\n' +
      '[pinwin-mcp] Add it to your MCP server config under "env".\n'
    )
    process.exit(1)
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[pinwin-mcp] Server running. Tools: get_games, place_bet, check_bets, claim_bets\n')
}

main().catch(e => {
  process.stderr.write(`[pinwin-mcp] Fatal: ${e.message}\n`)
  process.exit(1)
})
