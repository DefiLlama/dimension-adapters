import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default {
  ...liquityV2Exports({
    [CHAIN.ETHEREUM]: { collateralRegistry: '0x5e159fAC2D137F7B83A12B9F30ac6aB2ba6d45E7', }
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