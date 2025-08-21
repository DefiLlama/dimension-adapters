import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";
import { METRIC } from "../../helpers/metrics";

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Spark treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Spark treasury.',
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
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets are collected by Spark treasury.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by Spark treasury.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Spark treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    ...aaveExport({
      [CHAIN.ETHEREUM]: {
        start: '2023-03-08',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xc13e21b648a5ee794902342038ff3adab66be987',
            dataProvider: '0xfc21d6d146e6086b8359705c8b28512a983db0cb',
          },
        ],
      },
      [CHAIN.XDAI]: {
        start: '2023-09-06',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2dae5307c5e3fd1cf5a72cb6f698f915860607e0',
            dataProvider: '0x2a002054a06546bb5a264d57a81347e23af91d18',
          },
        ],
      },
    })
  }
}

export default adapter
