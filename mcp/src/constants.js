// src/constants.js — shared constants for Pinwin MCP server

const { parseAbi } = require('viem')

const USDT           = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const RELAYER        = '0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d'
const CLAIM_CONTRACT = '0xf9548be470a4e130c90cea8b179fcd66d2972ac7'
const PINWIN_API     = 'https://api.pinwin.xyz'
const DATAFEED_HOST  = 'thegraph-1.onchainfeed.org'
const DATAFEED_PATH  = '/subgraphs/name/azuro-protocol/azuro-data-feed-polygon'
const BETS_HOST      = 'thegraph.onchainfeed.org'
const BETS_PATH      = '/subgraphs/name/azuro-protocol/azuro-api-polygon-v3'
const DEFAULT_RPC    = 'https://polygon-bor-rpc.publicnode.com'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
])

const MAIN_MARKET_NAMES = new Set([
  'Match Winner',
  'Full Time Result',
  'Winner',
  'Fight Winner',
  'Whole game - Full time result Goal',
])

const SPORT_SLUG_ALIASES = {
  'hockey':            'ice-hockey',
  'nhl':               'ice-hockey',
  'ice-hockey':        'ice-hockey',
  'icehockey':         'ice-hockey',
  'soccer':            'football',
  'basketball':        'basketball',
  'nba':               'basketball',
  'mma':               'mma',
  'baseball':          'baseball',
  'mlb':               'baseball',
  'american-football': 'american-football',
  'nfl':               'american-football',
}

module.exports = {
  USDT, RELAYER, CLAIM_CONTRACT, PINWIN_API,
  DATAFEED_HOST, DATAFEED_PATH, BETS_HOST, BETS_PATH,
  DEFAULT_RPC, ERC20_ABI, MAIN_MARKET_NAMES, SPORT_SLUG_ALIASES,
}
