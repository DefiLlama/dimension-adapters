import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.ETHEREUM]: { 
      troveManager: '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2', 
      stableCoin: ADDRESSES.ethereum.LUSD,
      holderRevenuePercentage: 100,
      protocolRevenuePercentage: 0, // no protocol revenue
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to LUSD stability pool and LQTY stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to LUSD stability pool and LQTY stakers.',
    SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    ProtocolRevenue: 'No revenue for Liquity protocol.',
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
      'Liquidation Profit': 'On liquidations, there are an amount of profit from ETH collaterals are distributed to stability pool stakers.',
    },
    Revenue: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
      'Redemption Fees': 'Redemption fees paid by borrowers.',
    },
    HoldersRevenue: {
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to LUSD stability pool and LQTY stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to LUSD stability pool and LQTY stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
      'Liquidation Profit': 'On liquidations, there are an amount of profit from ETH collaterals are distributed to stability pool stakers.',
    },
    ProtocolRevenue: 'No revenue for Liquity protocol.',
  },
}