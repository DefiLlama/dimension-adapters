import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryAllium } from '../../helpers/allium'
import { METRIC } from '../../helpers/metrics'

// Raydium LaunchLab platform fee vaults (SOL, USD1) of the PossumLabs platform config 46X3jvgtQdsynKd3bHQL7bLTnZZwpTFzPoyYQQUDJENG.
const PLATFORM_FEE_VAULTS = [
  '6wDfbPJQjLAm2mRootNNCZ4YM3oDfnnkLMbPX6pGF5D5',
  '8PqLcTGSaXEtPWaegZ9nA6rhmCgbZKEzB9uW2u2fjTgy',
]

// https://possumlabs.wtf/how-it-works: 0.3% of the 0.7% platform fee buys back WTFO.
const BUYBACK_SHARE = 3 / 7

const PROTOCOL_LABEL = 'Trading Fees To Protocol'

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    SELECT mint, SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE token_acc_to IN (${PLATFORM_FEE_VAULTS.map((vault) => `'${vault}'`).join(', ')})
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  for (const { mint, amount } of rows) {
    const buyback = amount * BUYBACK_SHARE
    dailyFees.add(mint, amount, METRIC.TRADING_FEES)
    dailyRevenue.add(mint, buyback, METRIC.TOKEN_BUY_BACK)
    dailyRevenue.add(mint, amount - buyback, PROTOCOL_LABEL)
    dailyHoldersRevenue.add(mint, buyback, METRIC.TOKEN_BUY_BACK)
    dailyProtocolRevenue.add(mint, amount - buyback, PROTOCOL_LABEL)
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-09-02',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Platform fee paid by traders on every buy and sell of a PossumLabs token while it is on its Raydium LaunchLab bonding curve. Excludes the token creator fee and the Raydium fee charged on the same trades.',
    UserFees: 'Platform fee paid by traders on every buy and sell of a PossumLabs token while it is on its bonding curve.',
    Revenue: 'The whole platform fee on bonding curve trades, collected by PossumLabs.',
    ProtocolRevenue: '4/7 of the platform fee on bonding curve trades, kept by PossumLabs for development and marketing.',
    HoldersRevenue: '3/7 of the platform fee on bonding curve trades, used to buy back WTFO: half is burned and half is shared with WTFO holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Platform fee on bonding curve buys and sells, paid in SOL or USD1.',
    },
    UserFees: {
      [METRIC.TRADING_FEES]: 'Platform fee on bonding curve buys and sells, paid in SOL or USD1.',
    },
    Revenue: {
      [PROTOCOL_LABEL]: '4/7 of the platform fee, kept for development and marketing.',
      [METRIC.TOKEN_BUY_BACK]: '3/7 of the platform fee, used to buy back WTFO.',
    },
    ProtocolRevenue: {
      [PROTOCOL_LABEL]: '4/7 of the platform fee, kept for development and marketing.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '3/7 of the platform fee, used to buy back WTFO: half burned, half shared with holders.',
    },
  },
}

export default adapter
