import { SimpleAdapter } from "../adapters/types";
import { aaveExport, AaveLendingPoolConfig } from "../helpers/aave";
import { CHAIN } from "../helpers/chains";

const AaveV1Markets: {[key: string]: Array<AaveLendingPoolConfig>} = {
  [CHAIN.ETHEREUM]: [
    {
      version: 1,
      lendingPoolProxy: '0x398eC7346DcD622eDc5ae82352F02bE94C62d119',
      dataProvider: '0x082B0cA59f2122c94E5F57Db0085907fa9584BA6',
    },
  ]
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
      pools: AaveV1Markets[CHAIN.ETHEREUM],
      start: '2020-01-09',
    },
  }),
}

export default adapter
