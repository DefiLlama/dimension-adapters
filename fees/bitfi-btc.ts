import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

interface config {
  token: string
  start: string
}

const chainConfig: Record<string, config> = {
  [CHAIN.ETHEREUM]: {
    token: '0xCdFb58c8C859Cb3F62ebe9Cf2767F9e036C7fb15',
    start: '2024-09-17',
  },
  [CHAIN.BSC]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2024-12-26',
  },
  [CHAIN.BASE]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-05-21',
  },
  [CHAIN.BITLAYER]: {
    token: '0xcdfb58c8c859cb3f62ebe9cf2767f9e036c7fb15',
    start: '2025-01-03',
  },
  [CHAIN.HEMI]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-03-14',
  },
  [CHAIN.CORE]: {
    token: '0xCdFb58c8C859Cb3F62ebe9Cf2767F9e036C7fb15',
    start: '2025-06-18',
  },
  [CHAIN.GOAT]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-06-24',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const { token } = chainConfig[options.chain]

  const feeCollectedLogs = await options.getLogs({
    target: token,
    eventAbi: 'event FeeCollected(address indexed user, uint8 indexed feeType, uint256 id, uint256 amount, uint256 percentageFee, uint256 fixedFee)',
  })

  // https://bitfi-2.gitbook.io/bitfi/developer/using-contract/bfbtc-fees#fee-parameters
  for (const log of feeCollectedLogs) {
    const totalFee = log.percentageFee + log.fixedFee
    dailyFees.add(token, totalFee, METRIC.DEPOSIT_WITHDRAW_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: 'Withdrawal fees from bfBTC (on EVM chains and Bitcoin network) paid by users.',
    UserFees: 'Withdrawal fees from bfBTC (on EVM chains and Bitcoin network) paid by users.',
    Revenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
    ProtocolRevenue: 'All fees collected are sent to BitFi protocol fee receiver address.',
    SupplySideRevenue: 'No withdrawal fees go to supply side. bfBTC holders earn yield through exchange rate appreciation from strategies.'
  },
}

export default adapter