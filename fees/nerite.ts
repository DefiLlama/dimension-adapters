import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default {
  ...liquityV2Exports({
    [CHAIN.ARBITRUM]: { collateralRegistry: '0x7f7fbc2711c0d6e8ef757dbb82038032dd168e68', }
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