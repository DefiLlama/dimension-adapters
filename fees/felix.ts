import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default {
  ...liquityV2Exports({
    [CHAIN.HYPERLIQUID]: { collateralRegistry: '0x9De1e57049c475736289Cb006212F3E1DCe4711B', stableTokenAbi: "address:feUSDToken" }
  }),
  methodology: {
    Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
    Revenue: 'Total interest, redemption fees paid by borrowers and liquidation profit',
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Interest': 'borrow interests paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    Revenue: {
      'Borrow Interest': 'borrow interests paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
    },
  },
}