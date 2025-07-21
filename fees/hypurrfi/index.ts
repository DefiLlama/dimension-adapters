import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";

const meta = {
  methodology: {
    Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
    Revenue: 'Amount of fees go to HypurrFi treasury.',
    SupplySideRevenue: 'Amount of fees distributed to suppliers.',
    ProtocolRevenue: 'Amount of fees go to HypurrFi treasury.',
  },
  breakdownMethodology: {
    Fees: {
      'BorrowInterest': 'All interest paid by borrowers from all markets (excluding USDXL).',
      'BorrowInterestUSDXL': 'All interest paid by borrowers from USDXL only.',
      'LiquidationFees': 'Fees from liquidation penalty and bonuses.',
      'FlashloanFees': 'Flashloan fees paid by flashloan borrowers and executors.',
    },
    Revenue: {
      'BorrowInterest': 'A portion of interest paid by borrowers from all markets (excluding USDXL).',
      'BorrowInterestUSDXL': 'All 100% interest paid by USDXL borrowers.',
      'LiquidationFees': 'A portion of fees from liquidation penalty and bonuses.',
      'FlashloanFees': 'A portion of fees paid by flashloan borrowers and executors.',
    },
    SupplySideRevenue: {
      'BorrowInterest': 'Amount of interest distributed to lenders from all markets (excluding USDXL).',
      'BorrowInterestUSDXL': 'No supply side revenue for lenders on USDXL market.',
      'LiquidationFees': 'Fees from liquidation penalty and bonuses are distributed to lenders.',
      'FlashloanFees': 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
    },
    ProtocolRevenue: {
      'BorrowInterest': 'Amount of interest distributed to lenders from all markets (excluding USDXL) are collected by HypurrFi treasury.',
      'BorrowInterestUSDXL': 'All interest paid on USDXL market are collected by HypurrFi treasury.',
      'LiquidationFees': 'A portion of fees from liquidation penalty and bonuses are colected by HypurrFi treasury.',
      'FlashloanFees': 'A portion of fees paid by flashloan borrowers and executors are collected by HypurrFi treasury.',
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
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
              0xca79db4b49f608ef54a5cb813fbed3a6387bc645: 'USDXL',
            }
          },
        ],
        meta,
      },
    })
  }
}

export default adapter