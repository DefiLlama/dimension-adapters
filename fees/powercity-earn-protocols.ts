import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.PULSECHAIN]: { 
      troveManager: '0x118b7CF595F6476a18538EAF4Fbecbf594338B39',
      stableCoin: '0xeb6b7932da20c6d7b3a899d5887d86dfb09a6408',
      holderRevenuePercentage: 100,
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to PXDC stability pool and EARN stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to PXDC stability pool and EARN stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for POWERCITY Earn Protocol.',
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    Revenue: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
    },
    HoldersRevenue: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to PXDC stability pool and EARN stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to PXDC stability pool and EARN stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for POWERCITY Earn Protocol.',
  },
}