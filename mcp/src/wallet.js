// src/wallet.js — viem client setup

const { createPublicClient, createWalletClient, http, encodeFunctionData } = require('viem')
const { polygon } = require('viem/chains')
const { privateKeyToAccount } = require('viem/accounts')
const { DEFAULT_RPC, USDT, RELAYER, ERC20_ABI } = require('./constants')

function getClients() {
  const key = process.env.BETTOR_PRIVATE_KEY
  if (!key) throw new Error('BETTOR_PRIVATE_KEY environment variable is not set')

  const rpc     = process.env.POLYGON_RPC_URL || DEFAULT_RPC
  const account = privateKeyToAccount(key)
  const bettor  = account.address

  const publicClient = createPublicClient({ chain: polygon, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpc) })

  return { account, bettor, publicClient, walletClient }
}

async function getBalances(publicClient, bettor) {
  const [pol, usdt] = await Promise.all([
    publicClient.getBalance({ address: bettor }),
    publicClient.readContract({ address: USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [bettor] }),
  ])
  return { pol, usdt }
}

async function ensureAllowance(publicClient, walletClient, bettor, account, required) {
  const allowance = await publicClient.readContract({
    address: USDT, abi: ERC20_ABI, functionName: 'allowance', args: [bettor, RELAYER],
  })
  if (allowance >= required) return null

  const approveTx = await walletClient.sendTransaction({
    to:   USDT,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [RELAYER, required] }),
  })
  await publicClient.waitForTransactionReceipt({ hash: approveTx })
  return approveTx
}

module.exports = { getClients, getBalances, ensureAllowance }
