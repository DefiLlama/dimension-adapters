import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default {
  ...liquityV1Exports({
    [CHAIN.BSC]: {
      troveManager: "0xFe5D0aBb0C4Addbb57186133b6FDb7E1FAD1aC15",
      stableCoin: "0xc28957E946AC244612BcB205C899844Cbbcb093D",
      holderRevenuePercentage: 100,
      collateralCoin: '0xc9ad421f96579ace066ec188a7bba472fb83017f', // BOOK
    }
  }),
  methodology: {
    Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
    Revenue: 'Borrow fees, redemption fees are distibuted to BUD stability pool and BOOK stakers.',
    HoldersRevenue: 'Borrow fees, redemption fees are distibuted to BUD stability pool and BOOK stakers.',
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
      'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to BUD stability pool and BOOK stakers.',
      'Redemption Fees': 'Redemption fees paid by borrowers distributed to BUD stability pool and BOOK stakers.',
    },
    SupplySideRevenue: {
      'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    ProtocolRevenue: 'No revenue for protocol.',
  },
};
