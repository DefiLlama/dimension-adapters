import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addTokensReceived } from '../../helpers/token'

// FEE_WALLET constant in PrivoOrders (0x18da607db67bc9cc4f2f5a4b26d09788b47cf60a) and PrivoBlockDesk (0x8D94fCe2925EBA2448DA28f9461c8b644c26b8e7)
const FEE_SAFE = '0xCc051cf47547386bA147FDDfcBCFE00E791C1418'

const LABEL = {
  TRADING_FEES: 'Trading Fees',
}

const fetch = async (options: FetchOptions) => {
  const owners: string[] = await options.api.call({ target: FEE_SAFE, abi: 'address[]:getOwners' })
  const ownerSet = new Set(owners.map(owner => owner.toLowerCase()))

  const received = await addTokensReceived({ options, target: FEE_SAFE, logFilter: ({ from }) => !ownerSet.has(from) })
  const dailyFees = options.createBalances()
  dailyFees.addBalances(received, LABEL.TRADING_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-11-17',
  methodology: {
    Fees: 'Trading fees PRIVO users pay on Robinhood Chain: 0.15% of the USDG side of spot swaps, basket trades, limit orders and TWAP orders, and 0.10% of block desk trades (on the USDG leg, or on the taker leg when neither side is USDG), excluding fees paid from PRIVO team wallets, Uniswap LP fees and perps builder fees that Orderly settles off chain.',
    Revenue: 'All trading fees PRIVO users pay on spot swaps, basket trades, limit orders, TWAP orders and block desk trades, kept by PRIVO.',
    ProtocolRevenue: 'All trading fees PRIVO users pay on spot swaps, basket trades, limit orders, TWAP orders and block desk trades, sent to the PRIVO fee wallet.',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.TRADING_FEES]: '0.15% of the USDG side of spot swaps, basket trades, limit orders and TWAP orders, and 0.10% of block desk trades, paid by PRIVO users; fees paid from PRIVO team wallets are excluded.',
    },
    Revenue: {
      [LABEL.TRADING_FEES]: 'All trading fees PRIVO users pay on spot swaps, basket trades, limit orders, TWAP orders and block desk trades, kept by PRIVO.',
    },
    ProtocolRevenue: {
      [LABEL.TRADING_FEES]: 'All trading fees PRIVO users pay on spot swaps, basket trades, limit orders, TWAP orders and block desk trades, sent to the PRIVO fee wallet.',
    },
  },
}

export default adapter
