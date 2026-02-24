import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";
import { METRIC } from "../../helpers/metrics";

const info = {
  methodology: {
    Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
    Revenue: 'Amount of fees go to HypurrFi treasury.',
    SupplySideRevenue: 'Amount of fees distributed to suppliers.',
    ProtocolRevenue: 'Amount of fees go to HypurrFi treasury.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets (excluding USDXL).',
      'Borrow Interest USDXL': 'All interest paid by borrowers from USDXL only.',
      [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
      [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets (excluding USDXL).',
      'Borrow Interest USDXL': 'All 100% interest paid by USDXL borrowers.',
      [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
      [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding USDXL).',
      'Borrow Interest USDXL': 'No supply side revenue for lenders on USDXL market.',
      [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
      [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding USDXL) are collected by HypurrFi treasury.',
      'Borrow Interest USDXL': 'All interest paid on USDXL market are collected by HypurrFi treasury.',
      [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by HypurrFi treasury.',
      [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by HypurrFi treasury.',
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: info.methodology,
  breakdownMethodology: info.breakdownMethodology,
  adapter: {
    ...aaveExport({
      [CHAIN.HYPERLIQUID]: {
        start: '2025-02-20',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xcecce0eb9dd2ef7996e01e25dd70e461f918a14b',
            dataProvider: '0x895c799a5bbdcb63b80bee5bd94e7b9138d977d6',
            selfLoanAssets: {
              '0xca79db4b49f608ef54a5cb813fbed3a6387bc645': 'USDXL',
            }
          },
        ],
      },
    })
  }
}

export default adapter