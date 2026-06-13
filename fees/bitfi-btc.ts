import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

interface config {
  token: string
  start: string
  deadFrom?: string
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
    deadFrom: '2026-02-18',
  },
  [CHAIN.GOAT]: {
    token: '0x623F2774d9f27B59bc6b954544487532CE79d9DF',
    start: '2025-06-24',
    deadFrom: '2026-02-04',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const { token } = chainConfig[options.chain]

  const [feeCollectedLogs, epochUpdatedLogs] = await Promise.all([
    options.getLogs({
      target: token,
      eventAbi: 'event FeeCollected(address indexed user, uint8 indexed feeType, uint256 id, uint256 amount, uint256 percentageFee, uint256 fixedFee)',
    }),
    options.getLogs({
      target: token,
      eventAbi: 'event EpochUpdated(uint256 epochNumber, uint256 newRatio, uint256 newUnderlyingPrice)',
    }),
  ])

  for (const log of feeCollectedLogs) {
    const totalFee = log.percentageFee + log.fixedFee
    dailyFees.add(token, totalFee, METRIC.DEPOSIT_WITHDRAW_FEES)
    dailyUserFees.add(token, totalFee, METRIC.DEPOSIT_WITHDRAW_FEES)
    dailyRevenue.add(token, totalFee, METRIC.DEPOSIT_WITHDRAW_FEES)
  }

  const yieldLogs = epochUpdatedLogs.filter((log: any) => Number(log.epochNumber) > 0)
  if (yieldLogs.length) {
    const [totalSupply, previousRatios] = await Promise.all([
      options.fromApi.call({ target: token, abi: 'uint256:totalSupply' }),
      options.toApi.multiCall({
        target: token,
        calls: yieldLogs.map((log: any) => Number(log.epochNumber) - 1),
        abi: 'function ratio(uint256) view returns (uint256)',
      }),
    ])

    yieldLogs.forEach((log: any, index: number) => {
      const previousRatio = BigInt(previousRatios[index])
      if (previousRatio === 0n) return
      const strategyYield = (BigInt(totalSupply) * (previousRatio - BigInt(log.newRatio))) / previousRatio
      dailyFees.add(token, strategyYield, METRIC.ASSETS_YIELDS)
      dailySupplySideRevenue.add(token, strategyYield, METRIC.ASSETS_YIELDS)
    })
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: 'Withdrawal fees from bfBTC paid by users, plus bfBTC strategy yield accrued through bfBTC/BTC exchange-rate appreciation.',
    UserFees: 'Withdrawal fees from bfBTC (on EVM chains and Bitcoin network) paid by users.',
    Revenue: 'Withdrawal fees collected by the BitFi protocol fee receiver.',
    ProtocolRevenue: 'Withdrawal fees collected by the BitFi protocol fee receiver.',
    SupplySideRevenue: 'bfBTC strategy yield accrued to holders through exchange-rate appreciation.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Fees collected during bfBTC requestWithdraw, requestWithdrawNative, and cross-chain actions.',
      [METRIC.ASSETS_YIELDS]: 'bfBTC strategy yield measured from bfBTC/BTC ratio changes.',
    },
    UserFees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Fees paid directly by users during bfBTC withdrawal and cross-chain actions.',
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal and cross-chain fees collected by the BitFi protocol fee receiver.',
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal and cross-chain fees collected by the BitFi protocol fee receiver.',
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: 'bfBTC holder yield from exchange-rate appreciation.',
    },
  },
}

export default adapter
