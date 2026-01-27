import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getPoolFees, AaveLendingPoolConfig } from "../helpers/aave";
import { METRIC } from '../helpers/metrics';

const DISABLED_ASSETS = [ADDRESSES.bsc.BUSD, ADDRESSES.bsc.BTUSD]

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  const config = {
    pools: [
      {
        version: 2,
        lendingPoolProxy: '0xE29A55A6AEFf5C8B1beedE5bCF2F0Cb3AF8F91f5',
        dataProvider: '0xc9704604E18982007fdEA348e8DDc7CC652E34cA',
      },
    ],
  }
  for (const pool of config.pools) {
    await getPoolFees(pool as AaveLendingPoolConfig, options, {
      dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
    })
  }
  dailyFees.removeTokenBalance(DISABLED_ASSETS[0])
  dailyFees.removeTokenBalance(DISABLED_ASSETS[1])

  dailyProtocolRevenue.removeTokenBalance(DISABLED_ASSETS[0])
  dailyProtocolRevenue.removeTokenBalance(DISABLED_ASSETS[1])

  dailySupplySideRevenue.removeTokenBalance(DISABLED_ASSETS[0])
  dailySupplySideRevenue.removeTokenBalance(DISABLED_ASSETS[1])

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Valas Finance treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Valas Finance treasury.',
  HoldersRevenue: 'No revenue share to VALAS token holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets are collected by Valas Finance treasury.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by Valas Finance treasury.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Valas Finance treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2022-03-20',
    },
  }
}

export default adapter
