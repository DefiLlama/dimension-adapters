import { SimpleAdapter } from "../adapters/types";
import { aaveExport, AaveLendingPoolConfig } from "../helpers/aave";
import { CHAIN } from "../helpers/chains";

const AaveV2Markets: {[key: string]: Array<AaveLendingPoolConfig>} = {
  [CHAIN.ETHEREUM]: [
    {
      version: 2,
      lendingPoolProxy: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
      dataProvider: '0x057835ad21a177dbdd3090bb1cae03eacf78fc6d',
    },
  ],
  [CHAIN.POLYGON]: [
    {
      version: 2,
      lendingPoolProxy: '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
      dataProvider: '0x7551b5d2763519d4e37e8b81929d336de671d46d',
    },
  ],
  [CHAIN.AVAX]: [
    {
      version: 2,
      lendingPoolProxy: '0x4f01aed16d97e3ab5ab2b501154dc9bb0f1a5a2c',
      dataProvider: '0x65285e9dfab318f57051ab2b139cccf232945451',
    },
  ],
}

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Aave treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Aave treasury.',
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
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: aaveExport({
    [CHAIN.ETHEREUM]: {
      pools: AaveV2Markets[CHAIN.ETHEREUM],
      start: '2020-12-01',
    },
    [CHAIN.POLYGON]: {
      pools: AaveV2Markets[CHAIN.POLYGON],
      start: '2021-04-01',
    },
    [CHAIN.AVAX]: {
      pools: AaveV2Markets[CHAIN.AVAX],
      start: '2021-09-21',
    },
  }),
}

export default adapter
