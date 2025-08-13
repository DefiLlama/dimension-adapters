import { CHAIN } from '../helpers/chains'
import { getPoolFees } from '../helpers/aave'
import { AaveMarkets } from './aave'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../adapters/types'
import ADDRESSES from '../helpers/coreAssets.json'
import { addTokensReceived } from '../helpers/token'

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Aave treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Aave treasury.',
  HoldersRevenue: 'Aave Token Buybacks from Aave Treasury after 14th April 2025.',
}

const breakdownMethodology = {
  Fees: {
    'Borrow Interest': 'All interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All interest paid by borrowers from GHO only.',
    'Liquidation Fees': 'Fees from liquidation penalty and bonuses.',
    'Flashloan Fees': 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    'Borrow Interest': 'A portion of interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All 100% interest paid by GHO borrowers.',
    'Liquidation Fees': 'A portion of fees from liquidation penalty and bonuses.',
    'Flashloan Fees': 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    'Borrow Interest': 'Amount of interest distributed to lenders from all markets (excluding GHO).',
    'Borrow Interest GHO': 'No supply side revenue for lenders on GHO market.',
    'Liquidation Fees': 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    'Flashloan Fees': 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    'Borrow Interest': 'Amount of interest distributed to lenders from all markets (excluding GHO) are collected by Aave treasury.',
    'Borrow Interest GHO': 'All interest paid on GHO market are collected by Aave treasury.',
    'Liquidation Fees': 'A portion of fees from liquidation penalty and bonuses are colected by Aave treasury.',
    'Flashloan Fees': 'A portion of fees paid by flashloan borrowers and executors are collected by Aave treasury.',
  },
  HoldersRevenue: 'Aave Token Buybacks from Aave Treasury after 14th April 2025.',
}

const chainConfig = {
  [CHAIN.ETHEREUM]: {
    pools: AaveMarkets[CHAIN.ETHEREUM],
    start: '2023-01-01',
  },
  [CHAIN.OPTIMISM]: {
    pools: AaveMarkets[CHAIN.OPTIMISM],
    start: '2022-08-05',
  },
  [CHAIN.ARBITRUM]: {
    pools: AaveMarkets[CHAIN.ARBITRUM],
    start: '2022-03-12',
  },
  [CHAIN.POLYGON]: {
    pools: AaveMarkets[CHAIN.POLYGON],
    start: '2022-03-12',
  },
  [CHAIN.AVAX]: {
    pools: AaveMarkets[CHAIN.AVAX],
    start: '2022-03-12',
  },
  [CHAIN.FANTOM]: {
    pools: AaveMarkets[CHAIN.FANTOM],
    start: '2022-03-12',
  },
  [CHAIN.BASE]: {
    pools: AaveMarkets[CHAIN.BASE],
    start: '2023-08-09',
  },
  [CHAIN.BSC]: {
    pools: AaveMarkets[CHAIN.BSC],
    start: '2023-11-18',
  },
  [CHAIN.METIS]: {
    pools: AaveMarkets[CHAIN.METIS],
    start: '2023-04-24',
  },
  [CHAIN.XDAI]: {
    pools: AaveMarkets[CHAIN.XDAI],
    start: '2023-10-05',
  },
  [CHAIN.SCROLL]: {
    pools: AaveMarkets[CHAIN.SCROLL],
    start: '2024-01-21',
  },
  [CHAIN.ERA]: {
    pools: AaveMarkets[CHAIN.ERA],
    start: '2024-09-09',
  },
  [CHAIN.LINEA]: {
    pools: AaveMarkets[CHAIN.LINEA],
    start: '2024-11-24',
  },
  [CHAIN.SONIC]: {
    pools: AaveMarkets[CHAIN.SONIC],
    start: '2025-02-16',
  },
  [CHAIN.CELO]: {
    pools: AaveMarkets[CHAIN.CELO],
    start: '2025-02-16',
  },
  [CHAIN.SONEIUM]: {
    pools: AaveMarkets[CHAIN.SONEIUM],
    start: '2025-05-14',
  },
}

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  const pools = AaveMarkets[options.chain]

  for (const pool of pools) {
    await getPoolFees(pool, options, {
      dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
    })
  }

  let dailyHoldersRevenue = options.createBalances()
  if (options.chain === CHAIN.ETHEREUM) {
    // AAVE Buybacks https://app.aave.com/governance/v3/proposal/?proposalId=286
    dailyHoldersRevenue = await addTokensReceived({ options, tokens: [ADDRESSES.ethereum.AAVE], target: '0x22740deBa78d5a0c24C58C740e3715ec29de1bFa' })
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {}
}
for (const [chain, config] of Object.entries(chainConfig)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.start,
  }
}

export default adapter
