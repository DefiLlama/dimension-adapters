import { Adapter, FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

/**
 * Ankr Liquid Staking Fee Adapter
 *
 * This adapter tracks fees/revenue from Ankr's LIQUID STAKING products only.
 * Ankr has other revenue streams not tracked here:
 * - RPC/Node API (paid API credits)
 * - Flash Loans (0.5% fee on BNB swap pool)
 * - AppChains, Bridge, and other services
 *
 * Supported liquid staking chains (from https://www.ankr.com/staking/stake/):
 * - ETH, FLOW, SUI, IOTA, BNB, AVAX, POL, FTM (legacy)
 *
 * Fee Structure (from Ankr docs):
 * - ETH, BNB, AVAX: 10% of staking rewards
 * - FTM: 15% of staking rewards
 * - POL: 5% of staking rewards
 * - FLOW: 10% assumed
 * - SUI, IOTA: Partner staking (Volo/Swirl) - 10%, revenue split with partners unclear
 *
 * Data Sources:
 * - ETH: Trustless ratio API (calculates true ratio from validator balances)
 * - Others: Metrics API (TVL * APY / 365)
 *
 * Note: The on-chain ratio() is a stored value updated via periodic transactions (not every block).
 * Ankr's trustless ratio API calculates the true ratio from live Beacon chain validator balances,
 * giving us accurate daily changes for fee calculation.
 */

const chainConfig: Record<string, { tokens: string[]; start: string; feeRates: number[] }> = {
  [CHAIN.ETHEREUM]: {
    tokens: ['0xE95A203B1a91a908F9B9CE46459d101078c2c3cb', '0x26dcfbfa8bc267b250432c01c982eaf81cc5480c'],
    start: '2021-12-01',
    feeRates: [0.1, 0.05],
  },
  [CHAIN.FLOW]: {
    tokens: ['0x1b97100eA1D7126C4d60027e231EA4CB25314bdb'],
    start: '2024-09-06',
    feeRates: [0.1],
  },
  [CHAIN.BSC]: {
    tokens: ['0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827'],
    start: '2022-12-08',
    feeRates: [0.1],
  },
  [CHAIN.AVAX]: {
    tokens: ['0xc3344870d52688874b06d844E0C36cc39FC727F6'],
    start: '2022-06-07',
    feeRates: [0.1],
  },
  [CHAIN.FANTOM]: {
    tokens: ['0xcfc785741dc0e98ad4c9f6394bb9d43cd1ef5179'],
    start: '2022-05-04',
    feeRates: [0.15],
  },
}

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const tokens = chainConfig[options.chain].tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    const totalSupply = await options.fromApi.call({ target: token, abi: "uint256:totalSupply" });
    const ratioBefore = await options.fromApi.call({ target: token, abi: "uint256:ratio" });
    const ratioAfter = await options.toApi.call({ target: token, abi: "uint256:ratio" });

    const exchangeRateBefore = 1e18/ratioBefore
    const exchangeRateAfter = 1e18/ratioAfter
    const exchangeRateChange = (exchangeRateAfter - exchangeRateBefore)
    const df = (totalSupply * exchangeRateChange)

    dailyFees.add(token, Number(df), METRIC.STAKING_REWARDS)
    dailyRevenue.add(token, Number(df) * chainConfig[options.chain].feeRates[i], METRIC.PROTOCOL_FEES)
    dailySupplySideRevenue.add(token, Number(df) * (1 - chainConfig[options.chain].feeRates[i]), METRIC.STAKING_REWARDS)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total staking rewards earned from Liquid Staking only (before protocol fee). Does not include RPC/API, flash loans, or other Ankr services.',
  Revenue: 'Protocol fee collected by Ankr from Liquid Staking (10% on most chains, 15% on FTM, 5% on POL).',
  ProtocolRevenue: 'All Liquid Staking fees go to Ankr protocol operations.',
  SupplySideRevenue: 'Staking rewards distributed to liquid staking token holders after fees.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Total staking rewards earned from Liquid Staking before protocol commission.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Commission taken by Ankr from staking rewards (10-15% depending on chain).',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'Commission taken by Ankr from staking rewards (10-15% depending on chain).',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'Net staking rewards distributed to liquid staking token holders after protocol commission.',
  },
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-12-01',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-12-08',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-06-07',
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: '2022-05-04',
    },
    [CHAIN.FLOW]: {
      fetch,
      start: '2024-09-06',
    },
    // [CHAIN.SUI]: {
    //   fetch: createMetricsFetch('sui'),
    //   start: '2024-01-01',
    //   runAtCurrTime: true,
    // },
    // [CHAIN.IOTAEVM]: {
    //   fetch: createMetricsFetch('iota'),
    //   start: '2024-01-01',
    //   runAtCurrTime: true,
    // },
  },
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
}

export default adapter
