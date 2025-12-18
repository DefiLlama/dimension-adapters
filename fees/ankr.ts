import { Adapter, FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import fetchURL from '../utils/fetchURL'

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
 * - FLOW,SUI, IOTA: 10% assumed (not documented)
 *
 * Data Sources:
 * - ETH: Trustless ratio API (calculates true ratio from validator balances)
 * - Others: Metrics API (TVL * APY / 365)
 *
 * Note: The on-chain ratio() is a stored value updated via periodic transactions (not every block).
 * Ankr's trustless ratio API calculates the true ratio from live Beacon chain validator balances,
 * giving us accurate daily changes for fee calculation.
 */

const ANKR_METRICS_API = 'https://api.staking.ankr.com/v1alpha/metrics'
const ETH_RATIO_API = 'https://api.staking.ankr.com/v1alpha/beacon/eth/ratio/history'

// Fee percentages taken from staking rewards (from Ankr docs)
const FEE_RATES: Record<string, number> = {
  eth: 0.1,
  bnb: 0.1,
  avax: 0.1,
  ftm: 0.15,
  polygon: 0.05,
  flowevm: 0.1,
  sui: 0.1,
  iota: 0.1,
}

interface YieldResult {
  totalRewards: number
  fees: number
  supplySide: number
}

interface AnkrMetricsResponse {
  services: Array<{
    serviceName: string
    totalStaked: string
    apy: string
    totalStakedUsd: string
  }>
}

interface EthRatioHistoryResponse {
  content: Array<{
    ratio: string
    block: string
    sharesSupply: string
  }>
}

/**
 * Calculate fees from staker rewards (ratio change reflects post-fee rewards).
 *
 * Formula derivation:
 *   stakerRewards = totalRewards * (1 - feeRate)
 *   totalRewards = stakerRewards / (1 - feeRate)
 *   protocolFees = totalRewards * feeRate
 *
 * Example (10% fee): stakers get 90 → total was 100, protocol took 10
 */
function calculateFeesFromStakerRewards(stakerRewards: number, feeRate: number): YieldResult {
  if (stakerRewards <= 0) return { totalRewards: 0, fees: 0, supplySide: 0 }

  const totalRewards = stakerRewards / (1 - feeRate)
  return {
    totalRewards,
    fees: totalRewards * feeRate,
    supplySide: stakerRewards,
  }
}

function buildReturn(dailyFees: number, dailyRevenue: number, dailySupplySide: number) {
  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySide,
    dailyHoldersRevenue: 0,
  }
}

/**
 * Fetch fees using Ankr's trustless ratio API for ETH.
 * This API calculates the true ratio from actual validator balances on Beacon chain.
 */
async function fetchEthFromRatioApi(): Promise<YieldResult> {
  const response: EthRatioHistoryResponse = await fetchURL(`${ETH_RATIO_API}?page=0&size=2`)

  if (!response.content || response.content.length < 2)
    return { totalRewards: 0, fees: 0, supplySide: 0 }

  const latest = response.content[0]
  const previous = response.content[1]

  const latestRatio = Number(latest.ratio)
  const previousRatio = Number(previous.ratio)
  const sharesSupply = Number(latest.sharesSupply)

  // Ratio decreases as rewards accrue (more underlying per share)
  const ratioChange = (previousRatio - latestRatio) / previousRatio
  if (ratioChange <= 0) return { totalRewards: 0, fees: 0, supplySide: 0 }

  // TVL = sharesSupply * 1e18 / ratio (in wei, then convert to ETH)
  const tvlWei = (sharesSupply * 1e18) / latestRatio
  const tvlEth = tvlWei / 1e18

  // Staker rewards from ratio change
  const stakerRewardsEth = tvlEth * ratioChange

  return calculateFeesFromStakerRewards(stakerRewardsEth, FEE_RATES['eth'])
}

/**
 * Fetch fees from Ankr metrics API.
 * Uses TVL * APY / 365 to estimate daily rewards.
 */
async function fetchFromMetricsApi(serviceName: string): Promise<YieldResult> {
  const response: AnkrMetricsResponse = await fetchURL(ANKR_METRICS_API)
  const service = response.services.find((s) => s.serviceName === serviceName)

  if (!service) return { totalRewards: 0, fees: 0, supplySide: 0 }

  const apy = parseFloat(service.apy)
  if (apy === 0) return { totalRewards: 0, fees: 0, supplySide: 0 }

  const totalStakedUsd = parseFloat(service.totalStakedUsd)
  const dailyStakerRewards = (totalStakedUsd * (apy / 100)) / 365

  return calculateFeesFromStakerRewards(dailyStakerRewards, FEE_RATES[serviceName])
}

async function fetchEthereum(options: FetchOptions) {
  const ethYield = await fetchEthFromRatioApi()

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.addGasToken(ethYield.totalRewards * 1e18)
  dailyRevenue.addGasToken(ethYield.fees * 1e18)
  dailySupplySideRevenue.addGasToken(ethYield.supplySide * 1e18)

  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

function createMetricsFetch(serviceName: string) {
  return async () => {
    const data = await fetchFromMetricsApi(serviceName)
    return buildReturn(data.totalRewards, data.fees, data.supplySide)
  }
}

const methodology = {
  Fees: 'Total staking rewards earned from Liquid Staking only (before protocol fee). Does not include RPC/API, flash loans, or other Ankr services.',
  UserFees: 'Users do not pay fees directly; fees are deducted from staking rewards.',
  Revenue:
    'Protocol fee collected by Ankr from Liquid Staking (10% on most chains, 15% on FTM, 5% on POL).',
  ProtocolRevenue: 'All Liquid Staking fees go to Ankr protocol operations.',
  SupplySideRevenue: 'Staking rewards distributed to liquid staking token holders after fees.',
  HoldersRevenue: 'No revenue distributed to ANKR token holders.',
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: '2021-12-01',
    },
    [CHAIN.BSC]: {
      fetch: createMetricsFetch('bnb'),
      start: '2022-12-08',
      runAtCurrTime: true,
    },
    [CHAIN.AVAX]: {
      fetch: createMetricsFetch('avax'),
      start: '2022-06-07',
      runAtCurrTime: true,
    },
    [CHAIN.FANTOM]: {
      fetch: createMetricsFetch('ftm'),
      start: '2022-05-04',
      runAtCurrTime: true,
    },
    [CHAIN.FLOW]: {
      fetch: createMetricsFetch('flowevm'),
      start: '2024-09-06',
      runAtCurrTime: true,
    },
    [CHAIN.SUI]: {
      fetch: createMetricsFetch('sui'),
      start: '2024-01-01',
      runAtCurrTime: true,
    },
    [CHAIN.IOTAEVM]: {
      fetch: createMetricsFetch('iota'),
      start: '2024-01-01',
      runAtCurrTime: true,
    },
    [CHAIN.POLYGON]: {
      fetch: createMetricsFetch('polygon'),
      start: '2022-01-01',
      runAtCurrTime: true,
    },
  },
  methodology,
}

export default adapter
