import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.PULSECHAIN]: { 
      troveManager: '0xD79bfb86fA06e8782b401bC0197d92563602D2Ab', 
      redemptionEvent: 'event Redemption(uint256 _attemptedUSDLAmount, uint256 _actualUSDLAmount, uint256 _PLSSent, uint256 _ETHFee)',
      borrowingEvent: 'event USDLBorrowingFeePaid(address indexed _borrower, uint256 _LUSDFee)',
      stableCoin: '0x0deed1486bc52aa0d3e6f8849cec5add6598a162',
      holderRevenuePercentage: 100,
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to USDL stability pool and LOAN stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USDL stability pool and LOAN stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for protocol.',
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
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USDL stability pool and LOAN stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to USDL stability pool and LOAN stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for protocol.',
  },
}
