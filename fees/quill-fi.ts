import { liquityV2Exports } from "../helpers/liquity"

export default {
  ...liquityV2Exports({
    scroll: { collateralRegistry: '0xcc4f29f9d1b03c8e77fc0057a120e2c370d6863d' }
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
