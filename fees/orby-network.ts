import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.CRONOS]: { 
      troveManager: '0x7a47cf15a1fcbad09c66077d1d021430eed7ac65', 
      redemptionEvent: 'event Redemption(uint256 _attemptedUSCAmount, uint256 _actualUSCAmount, uint256 _CollSent, uint256 _ETHFee)',
      borrowingEvent: 'event USCBorrowingFeePaid(address indexed _borrower, uint _LUSDFee)',
      stableCoin: '0xD42E078ceA2bE8D03cd9dFEcC1f0d28915Edea78',
      holderRevenuePercentage: 100,
    },
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to USC stability pool and ORB stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USC stability pool and ORB stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for Orby Network protocol.',
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
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USC stability pool and ORB stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to USC stability pool and ORB stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for Orby Network protocol.',
  },
}