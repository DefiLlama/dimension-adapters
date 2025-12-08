import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

interface BfUSDConfig {
  token: string
  instantRedeemer: string
  start: string
}

const bfUSDConfig: Record<string, BfUSDConfig> = {
  [CHAIN.ETHEREUM]: {
    token: '0xa3eB7A9e57FCa4e40b79E394eD5eB37fEd205A24',
    instantRedeemer: '0x0971cB672b4eF3E19284Aa64717aFb154A6fbeDF',
    start: '2025-11-03',
  },
}

async function fetchBfUSD(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const { token, instantRedeemer } = bfUSDConfig[options.chain]

  const crossChainFeeLogs = await options.getLogs({
    target: token,
    eventAbi: 'event CrossChainFeeCollected(address indexed user, uint256 amount, uint256 fee)',
  })

  for (const log of crossChainFeeLogs) {
    dailyFees.add(token, log.fee, METRIC.DEPOSIT_WITHDRAW_FEES)
  }

  const instantRedemptionLogs = await options.getLogs({
    target: instantRedeemer,
    eventAbi: 'event InstantRedemption(address indexed user, address indexed to, uint256 bfUSDAmount, uint256 underlyingAmount, uint256 feeAmount)',
  })

  for (const log of instantRedemptionLogs) {
    dailyFees.add(token, log.feeAmount, METRIC.MINT_REDEEM_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  adapter: {
    ...Object.fromEntries(
      Object.entries(bfUSDConfig).map(([chain, config]) => [
        chain,
        {
          fetch: fetchBfUSD,
          start: config.start,
        },
      ])
    ),
  },
  version: 2,
  methodology: {
    Fees: 'Instant redemption and cross-chain transfer fees from bfUSD paid by users.',
    UserFees: 'Instant redemption and cross-chain transfer fees from bfUSD paid by users.',
    Revenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
    ProtocolRevenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
  },
}

export default adapter
