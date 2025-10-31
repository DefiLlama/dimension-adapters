import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.PULSECHAIN]: { 
      troveManager: '0xC2D0720721d48cE85e20Dc9E01B8449D7eDd14CE',
      stableCoin: '0x1fe0319440a672526916c232eaee4808254bdb00',
      holderRevenuePercentage: 100,
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to HEXDC stability pool and FLEX stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to HEXDC stability pool and FLEX stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for Powercity Flex Protocol.',
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
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to HEXDC stability pool and FLEX stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to HEXDC stability pool and FLEX stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for Powercity Flex Protocol.',
  },
}