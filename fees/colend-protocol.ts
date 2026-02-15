import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.CORE]: {
        start: '2024-04-16',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x0cea9f0f49f30d376390e480ba32f903b43b19c5',
            dataProvider: '0x567af83d912c85c7a66d093e41d92676fa9076e3',
          },
        ],
      },
    })
  },
  methodology: {
    Fees: 'Include borrow interest, flashloan fees, and liquidation fees paid by borrowers.',
    Revenue: 'Amount of fees that go to CoLend protocol treasury.',
    SupplySideRevenue: 'Amount of fees distributed to lenders and liquidity providers.',
    ProtocolRevenue: 'Amount of fees that go to CoLend protocol treasury.',
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Interest': 'Interest paid by borrowers across all lending markets, calculated based on variable borrow rate and debt levels.',
      'Liquidation Fees': 'Liquidation bonuses collected when undercollateralized positions are liquidated, includes both liquidator rewards and protocol fees.',
      'Flashloan Fees': 'Fees paid by users executing flashloans from CoLend lending pools.',
    },
    Revenue: {
      'Borrow Interest': 'Portion of borrow interest retained by the protocol, determined by each market\'s reserve factor.',
      'Liquidation Fees': 'Protocol\'s share of liquidation bonuses, separate from the portion paid to liquidators.',
      'Flashloan Fees': 'Protocol\'s share of flashloan fees based on the flashloan premium rate.',
    },
    SupplySideRevenue: {
      'Borrow Interest': 'Interest distributed to lenders who supply capital to the protocol (total interest minus protocol reserve share).',
      'Liquidation Fees': 'Liquidation bonuses paid to liquidators for maintaining protocol solvency.',
      'Flashloan Fees': 'Flashloan fees distributed to liquidity providers (already reflected in liquidity index).',
    },
    ProtocolRevenue: {
      'Borrow Interest': 'Portion of borrow interest retained by the protocol, determined by each market\'s reserve factor.',
      'Liquidation Fees': 'Protocol\'s share of liquidation bonuses, separate from the portion paid to liquidators.',
      'Flashloan Fees': 'Protocol\'s share of flashloan fees based on the flashloan premium rate.',
    },
  }
}

export default adapter
