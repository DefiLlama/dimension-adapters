import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

interface ChainConfig {
  token: string
  start: string
}

interface BfUSDConfig extends ChainConfig {
  instantRedeemer: string
}

const bfBTCConfigs: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    token: '0xCdFb58c8C859Cb3F62ebe9Cf2767F9e036C7fb15',
    start: '2025-02-06',
  },
  [CHAIN.BSC]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-02-06',
  },
  [CHAIN.BASE]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-02-06',
  },
  [CHAIN.BITLAYER]: {
    token: '0xcdfb58c8c859cb3f62ebe9cf2767f9e036c7fb15',
    start: '2025-02-06',
  },
  [CHAIN.HEMI]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-02-06',
  },
  [CHAIN.CORE]: {
    token: '0xCdFb58c8C859Cb3F62ebe9Cf2767F9e036C7fb15',
    start: '2025-02-06',
  },
  [CHAIN.GOAT]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-02-06',
  },
}

const bfUSDConfig: Record<string, BfUSDConfig> = {
  [CHAIN.ETHEREUM]: {
    token: '0xa3eB7A9e57FCa4e40b79E394eD5eB37fEd205A24',
    instantRedeemer: '0x0971cB672b4eF3E19284Aa64717aFb154A6fbeDF',
    start: '2025-02-06',
  },
}

async function fetchBfBTC(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const { token } = bfBTCConfigs[options.chain]

  const feeCollectedLogs = await options.getLogs({
    target: token,
    eventAbi: 'event FeeCollected(address indexed user, uint8 indexed feeType, uint256 id, uint256 amount, uint256 percentageFee, uint256 fixedFee)',
  })

  for (const log of feeCollectedLogs) {
    dailyFees.add(token, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
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
      Object.entries(bfBTCConfigs).map(([chain, config]) => [
        chain,
        {
          fetch: fetchBfBTC,
          start: config.start,
        },
      ])
    ),
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
    Fees: 'Withdrawal fees from bfBTC (on EVM chains and Bitcoin network) and instant redemption + cross-chain transfer fees from bfUSD paid by users.',
    UserFees: 'Withdrawal fees from bfBTC (on EVM chains and Bitcoin network) and instant redemption + cross-chain transfer fees from bfUSD paid by users.',
    Revenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
    ProtocolRevenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
  },
}

export default adapter
