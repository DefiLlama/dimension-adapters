import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { addTokensReceived } from '../helpers/token'

// bskts (https://bskts.xyz): index baskets on Robinhood Chain. Each basket is a vault holding
// Stock Tokens and crypto behind its own token, bought and sold at net asset value. Every
// basket is created by one factory, which lists them on-chain.
const FACTORY = '0xb7c27E044E8Acc8aB3f091a2F9d424A32723e4c3'

// The bskts treasury. Every live basket's treasury() has been this address since 2026-09-08,
// when they were switched from per-basket FeeDistributors (which reinvested trading fees
// into the basket for its holders); three retired baskets still point at theirs and are
// not counted. The adapter starts on the first full day after the switch.
const TREASURY = '0x31c93091b9572e1dcfa21e8ceaa3b8d1944b3048'

// The two contracts that charge the mint fee on buys and the zap-out fee on sales, in USDG,
// and send it to the basket's treasury. No other bskts contract pays the treasury. The
// treasury also received accounts' network fees (gas repaid, under $10 each) until
// 2026-10-02; those come from the accounts themselves, so this list leaves them out.
const FEE_CHARGERS = new Set([
  '0x81f275d289f8cbd0b5d5efc5289f2933998e7d8e', // Zapper, e.g. tx 0x5d88747fdd5eaaa8d420cf51ffb40f926dec58c9f65f244909a2ed0d17b038e4
  '0xc12d7d93ee0dd10d5b890ee1250045bbaffbe627', // ZapperV2, e.g. tx 0xd4855db982b6be541a9785519c4168c5d2f5439f47e3810b946f9ac35605fccc
])

const ZERO = ADDRESSES.null
const TRANSFER = 'event Transfer(address indexed from, address indexed to, uint256 value)'

const fetch = async (options: FetchOptions) => {
  const { api } = options
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  // Mint and zap-out fees: USDG paid into the treasury by the zappers.
  const trading = await addTokensReceived({
    options,
    target: TREASURY,
    token: ADDRESSES.robinhood.USDG,
    logFilter: (log: any) => FEE_CHARGERS.has(log.from),
  })
  dailyFees.addBalances(trading, METRIC.MINT_REDEEM_FEES)
  dailyRevenue.addBalances(trading, 'Mint/Redeem Fees To Treasury')

  // Management fee: each basket streams its yearly fee by minting new shares to the treasury
  // (BasketVault.accrueFee). The treasury never buys baskets, so every mint to it is a fee.
  // The shares are valued as what they redeem for, at the end of the period.
  const baskets: string[] = await api.call({ target: FACTORY, abi: 'address[]:baskets' })
  const logs = await options.getLogs({ targets: baskets, eventAbi: TRANSFER, flatten: false })
  const shares = logs.map((basketLogs: any[]) =>
    basketLogs
      .filter((l) => l.from.toLowerCase() === ZERO && l.to.toLowerCase() === TREASURY)
      .reduce((sum, l) => sum + BigInt(l.value), 0n),
  )
  const minted = baskets.map((basket, i) => ({ basket, shares: shares[i] })).filter((m) => m.shares > 0n)
  if (minted.length) {
    const constituents = await api.multiCall({ abi: 'address[]:constituentTokens', calls: minted.map((m) => m.basket) })
    const redeemed = await api.multiCall({
      abi: 'function previewRedeem(uint256 shares) view returns (uint256[] amounts)',
      calls: minted.map((m) => ({ target: m.basket, params: [m.shares.toString()] })),
    })
    const management = options.createBalances()
    const held: { token: string, amount: bigint }[] = []
    constituents.forEach((tokens: string[], i: number) =>
      tokens.forEach((token, j) => held.push({ token, amount: BigInt(redeemed[i][j]) })),
    )
    await addUnwrapped(options, held, management)
    dailyFees.addBalances(management, METRIC.MANAGEMENT_FEES)
    dailyRevenue.addBalances(management, 'Management Fees To Treasury')
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  }
}

// The yield baskets (WAFER, COMET) hold Beefy CLM vault shares, which have no price of their
// own: each one is a claim on its vault's two tokens, so it is added as its share of them.
async function addUnwrapped(options: FetchOptions, held: { token: string, amount: bigint }[], balances: any) {
  const { api } = options
  const tokens = [...new Set(held.map((h) => h.token.toLowerCase()))]
  const wants = await api.multiCall({
    abi: 'function wants() view returns (address token0, address token1)',
    calls: tokens,
    permitFailure: true, // only Beefy CLM vaults have wants(); a Stock Token reverts
  })
  const clms = tokens.filter((_, i) => wants[i])
  const clmBalances = await api.multiCall({ abi: 'function balances() view returns (uint256 amount0, uint256 amount1)', calls: clms })
  const supplies = await api.multiCall({ abi: 'erc20:totalSupply', calls: clms })
  for (const { token, amount } of held) {
    const c = clms.indexOf(token.toLowerCase())
    if (c === -1) {
      balances.add(token, amount)
      continue
    }
    const supply = BigInt(supplies[c])
    if (!supply) continue
    const w = wants[tokens.indexOf(token.toLowerCase())]
    balances.add(w.token0, (BigInt(clmBalances[c].amount0) * amount) / supply)
    balances.add(w.token1, (BigInt(clmBalances[c].amount1) * amount) / supply)
  }
}

const methodology = {
  Fees: 'Fees paid by bskts users: the mint fee on buying a basket and the zap-out fee on selling one for USDG, plus each basket\'s yearly management fee.',
  Revenue: 'All mint, zap-out and management fees, kept by the bskts treasury.',
  ProtocolRevenue: 'All mint, zap-out and management fees, sent to the bskts treasury.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: 'The mint fee charged on buying a basket and the zap-out fee charged on selling one for USDG, paid in USDG.',
    [METRIC.MANAGEMENT_FEES]: 'Each basket\'s yearly management fee, streamed as new basket shares minted to the treasury, valued at what they redeem for.',
  },
  Revenue: {
    'Mint/Redeem Fees To Treasury': 'The mint and zap-out fees, all sent to the bskts treasury.',
    'Management Fees To Treasury': 'The management fee shares, all minted to the bskts treasury.',
  },
  ProtocolRevenue: {
    'Mint/Redeem Fees To Treasury': 'The mint and zap-out fees, all sent to the bskts treasury.',
    'Management Fees To Treasury': 'The management fee shares, all minted to the bskts treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-09', // the first full day after every live basket\'s fees went to the treasury
  methodology,
  breakdownMethodology,
}

export default adapter
