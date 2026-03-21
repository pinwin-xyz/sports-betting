// src/tools/place-bet.js — MCP tool: place_bet

const { postJson, getJson, sleep } = require('../http')
const { getClients, getBalances, ensureAllowance } = require('../wallet')
const { getMarketName, getSelectionName } = require('@azuro-org/dictionaries')
const {
  USDT, CLAIM_CONTRACT, PINWIN_API,
  DATAFEED_HOST, DATAFEED_PATH,
} = require('../constants')

async function placeBet({ conditionId, outcomeId, stake, startsAt, match: matchTitle }) {
  // ── Setup ─────────────────────────────────────────────────────────────────
  const { account, bettor, publicClient, walletClient } = getClients()
  const stakeAmount = BigInt(Math.round(stake * 1e6))

  // ── Resolve human-readable label ──────────────────────────────────────────
  let selectionLabel = String(outcomeId)
  let marketName     = 'Unknown market'
  try {
    selectionLabel = getSelectionName({ outcomeId, withPoint: true })
    marketName     = getMarketName({ outcomeId })
  } catch (_) {}

  // ── Step 0: Check balances ────────────────────────────────────────────────
  const { pol, usdt } = await getBalances(publicClient, bettor)

  if (pol < 100000000000000n) {
    throw new Error(`Insufficient POL for gas. Current balance: ${Number(pol) / 1e18} POL`)
  }
  if (usdt < stakeAmount) {
    throw new Error(`Insufficient USDT. Need ${stake} USDT, have ${Number(usdt) / 1e6} USDT`)
  }

  const lowPolWarning = pol < 1000000000000000000n
    ? `⚠️ POL balance is low (${(Number(pol) / 1e18).toFixed(4)} POL). Up to 2 txs needed.\n\n`
    : ''

  // ── Step 2: Re-check condition Active ────────────────────────────────────
  const checkRes = await postJson(DATAFEED_HOST, DATAFEED_PATH, {
    query: `{ conditions(where: { conditionId: "${conditionId}" }) { conditionId state outcomes { outcomeId currentOdds } } }`
  })
  if (checkRes.errors) throw new Error('Subgraph error: ' + JSON.stringify(checkRes.errors))

  const condition = checkRes.data?.conditions?.[0]
  if (!condition) throw new Error(`Condition ${conditionId} not found in data-feed`)
  if (condition.state !== 'Active') throw new Error(`Condition is no longer Active (state: ${condition.state}). Market has closed.`)

  const liveOutcome = condition.outcomes.find(o => String(o.outcomeId) === String(outcomeId))
  if (!liveOutcome) {
    const available = condition.outcomes.map(o => o.outcomeId).join(', ')
    throw new Error(`outcomeId ${outcomeId} not found in condition. Available: ${available}`)
  }

  const currentOdds = parseFloat(liveOutcome.currentOdds)
  const SLIPPAGE    = 0.02
  const minOdds     = BigInt(Math.round(currentOdds * (1 - SLIPPAGE) * 1e12))

  // ── Step 3: Call /agent/bet ───────────────────────────────────────────────
  const apiHost = PINWIN_API.replace('https://', '')
  const betBody = {
    amount:     Number(stakeAmount),
    minOdds:    Number(minOdds),
    chain:      'polygon',
    selections: [{ conditionId: String(conditionId), outcomeId: Number(outcomeId) }],
  }

  const betRes = await postJson(apiHost, '/agent/bet', betBody)
  if (!betRes.encoded) throw new Error('/agent/bet error: ' + JSON.stringify(betRes))

  const payload      = JSON.parse(Buffer.from(betRes.encoded, 'base64').toString('utf8'))
  const cd           = payload.signableClientBetData
  const payloadStake = BigInt(cd.bet?.amount ?? cd.bets?.[0]?.amount ?? cd.amount ?? 0)
  const relayerFee   = BigInt(cd.clientData?.relayerFeeAmount ?? cd.bets?.[0]?.relayerFeeAmount ?? 0)
  const totalNeeded  = payloadStake + relayerFee

  // ── Step 6: Verify payload ────────────────────────────────────────────────
  const payloadCondId  = cd.bet?.conditionId ?? cd.bets?.[0]?.conditionId
  const payloadOutcome = cd.bet?.outcomeId   ?? cd.bets?.[0]?.outcomeId
  const coreAddr       = cd.clientData?.core?.toLowerCase()

  if (String(payloadStake) !== String(stakeAmount))
    throw new Error(`Payload stake mismatch: expected ${stakeAmount}, got ${payloadStake}`)
  if (String(payloadCondId) !== String(conditionId))
    throw new Error(`conditionId mismatch: expected ${conditionId}, got ${payloadCondId}`)
  if (String(payloadOutcome) !== String(outcomeId))
    throw new Error(`outcomeId mismatch: expected ${outcomeId}, got ${payloadOutcome}`)
  if (coreAddr !== CLAIM_CONTRACT)
    throw new Error(`Core address mismatch: expected ${CLAIM_CONTRACT}, got ${coreAddr}`)

  // ── Step 5: Approve USDT if needed ───────────────────────────────────────
  const buffer   = 200000n
  const required = totalNeeded + buffer
  const approveTx = await ensureAllowance(publicClient, walletClient, bettor, account, required)

  // ── Step 7: Sign ──────────────────────────────────────────────────────────
  const primaryType     = payload.types.ClientComboBetData ? 'ClientComboBetData' : 'ClientBetData'
  const bettorSignature = await walletClient.signTypedData({
    account,
    domain:      payload.domain,
    types:       payload.types,
    primaryType,
    message:     payload.signableClientBetData,
  })

  // ── Step 7: Submit ────────────────────────────────────────────────────────
  const submitUrl  = new URL(payload.apiUrl)
  const submitHost = submitUrl.hostname
  const submitPath = submitUrl.pathname + submitUrl.search

  const submitRes = await postJson(submitHost, submitPath, {
    environment:   payload.environment,
    bettor,
    betOwner:      bettor,
    clientBetData: payload.apiClientBetData,
    bettorSignature,
  })

  if (!submitRes.id || submitRes.state === 'Rejected' || submitRes.state === 'Canceled') {
    throw new Error('Submission failed: ' + JSON.stringify(submitRes))
  }

  const orderId = submitRes.id

  // ── Step 7: Poll ──────────────────────────────────────────────────────────
  const apiBase = payload.apiUrl.replace(/\/bet\/orders\/(ordinar|combo)$/, '')
  let txHash    = null

  for (let i = 0; i < 30; i++) {
    await sleep(Math.min(2000 + i * 1000, 10000))
    let poll
    try { poll = await getJson(`${apiBase}/bet/orders/${orderId}`) } catch (_) { continue }
    if (poll.txHash) { txHash = poll.txHash; break }
    if (poll.state === 'Rejected' || poll.state === 'Canceled') {
      throw new Error(`Order ${poll.state}: ${poll.errorMessage || 'unknown'}`)
    }
  }

  if (!txHash) throw new Error(`Order did not settle after ~90s. Order ID: ${orderId} — check Polygonscan`)

  const potentialPayout = (Number(payloadStake) / 1e6) * currentOdds

  return {
    success:   true,
    txHash,
    orderId,
    bettor,
    match:     matchTitle || 'Unknown match',
    market:    marketName,
    selection: selectionLabel,
    stake:     Number(payloadStake) / 1e6,
    odds:      currentOdds,
    payout:    parseFloat(potentialPayout.toFixed(2)),
    polygonscan: `https://polygonscan.com/tx/${txHash}`,
    approvalTx:  approveTx ? `https://polygonscan.com/tx/${approveTx}` : null,
    lowPolWarning: lowPolWarning || null,
    startsAt:  startsAt || null,
  }
}

module.exports = { placeBet }
