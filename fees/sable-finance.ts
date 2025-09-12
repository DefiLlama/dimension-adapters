import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.BSC]: { 
      troveManager: '0xEC035081376ce975Ba9EAF28dFeC7c7A4c483B85',
      redemptionEvent: 'event Redemption(uint256 _attemptedUSDSAmount, uint256 _actualUSDSAmount, uint256 _BNBSent, uint256 _ETHFee)',
      stableCoin: '0x0c6Ed1E73BA73B8441868538E210ebD5DD240FA0',
      holderRevenuePercentage: 100,
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to USDS stability pool and SABLE stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USDS stability pool and SABLE stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for Liquity protocol.',
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
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USDS stability pool and SABLE stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to USDS stability pool and SABLE stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for Liquity protocol.',
  },
}