// src/tools/bets.js — MCP tools: check_bets, claim_bets

const { postJson } = require('../http')
const { getClients } = require('../wallet')
const { BETS_HOST, BETS_PATH, PINWIN_API, CLAIM_CONTRACT } = require('../constants')

// ─── check_bets ──────────────────────────────────────────────────────────────
async function checkBets({ limit = 20, onlyRedeemable = false }) {
  const { bettor, publicClient, walletClient, account } = getClients()

  const where = { bettor: bettor.toLowerCase() }
  if (onlyRedeemable) where.isRedeemable = true

  const res = await postJson(BETS_HOST, BETS_PATH, {
    query: `query {
      v3Bets(
        where: ${JSON.stringify(where).replace(/"([^"]+)":/g, '$1:')}
        first: ${limit}
        orderBy: createdBlockTimestamp
        orderDirection: desc
      ) {
        betId status result isRedeemable isRedeemed amount payout createdBlockTimestamp resolvedBlockTimestamp
      }
    }`
  })

  if (res.errors) throw new Error('Subgraph error: ' + JSON.stringify(res.errors))

  const bets = res.data?.v3Bets || []
  if (bets.length === 0) return { text: 'No bets found for this wallet.', bets: [] }

  // Build summary
  const lines = bets.map(b => {
    const date    = new Date(parseInt(b.createdBlockTimestamp) * 1000)
      .toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })
    const amount  = parseFloat(b.amount).toFixed(2)
    const payout  = b.payout ? parseFloat(b.payout).toFixed(2) : '—'
    let statusStr = b.status

    if (b.status === 'Resolved') {
      statusStr = b.result === 'Won'
        ? `✅ Won (payout: ${payout} USDT${b.isRedeemed ? ', already claimed' : b.isRedeemable ? ' — CLAIMABLE' : ''})`
        : `❌ Lost`
    } else if (b.status === 'Canceled') {
      statusStr = `🔄 Canceled (${b.isRedeemable ? 'stake REFUNDABLE' : 'already refunded'})`
    } else {
      statusStr = `⏳ Pending`
    }

    return `  betId ${b.betId} | ${date} | ${amount} USDT | ${statusStr}`
  })

  const redeemable = bets.filter(b => b.isRedeemable && !b.isRedeemed)
  const summary    = redeemable.length > 0
    ? `\n⚡ ${redeemable.length} bet(s) ready to claim: betIds ${redeemable.map(b => b.betId).join(', ')}`
    : ''

  return {
    text: lines.join('\n') + summary,
    bets,
    redeemableBetIds: redeemable.map(b => b.betId),
  }
}

// ─── claim_bets ──────────────────────────────────────────────────────────────
async function claimBets({ betIds }) {
  if (!betIds || betIds.length === 0) throw new Error('No betIds provided')

  const { account, bettor, publicClient, walletClient } = getClients()
  const apiHost = PINWIN_API.replace('https://', '')

  // Call /agent/claim
  const claimRes = await postJson(apiHost, '/agent/claim', {
    betIds,
    chain: 'polygon',
  })
  if (!claimRes.encoded) throw new Error('/agent/claim error: ' + JSON.stringify(claimRes))

  const payload = JSON.parse(Buffer.from(claimRes.encoded, 'base64').toString('utf8'))

  // Verify claim contract
  if (payload.to?.toLowerCase() !== CLAIM_CONTRACT) {
    throw new Error(`Claim contract mismatch: expected ${CLAIM_CONTRACT}, got ${payload.to}`)
  }

  // Send transaction
  const claimTx = await walletClient.sendTransaction({
    to:      payload.to,
    data:    payload.data,
    value:   0n,
    chainId: payload.chainId,
  })
  await publicClient.waitForTransactionReceipt({ hash: claimTx })

  return {
    success:    true,
    txHash:     claimTx,
    betIds,
    polygonscan: `https://polygonscan.com/tx/${claimTx}`,
  }
}

module.exports = { checkBets, claimBets }
