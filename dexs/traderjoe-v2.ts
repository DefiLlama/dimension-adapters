
import { CHAIN } from '../helpers/chains'
import { joeLiquidityBookExport } from "../helpers/joe";

export default {
  ...joeLiquidityBookExport({
    [CHAIN.AVAX]: {
      factories: [
        {
          factory: '0x6E77932A92582f504FF6c4BdbCef7Da6c198aEEf',
          version: 2,
          fromBlock: 22426953,
        },
      ]
    },
    [CHAIN.ARBITRUM]: {
      factories: [
        {
          factory: '0x1886D09C9Ade0c5DB822D85D21678Db67B6c2982',
          version: 2,
          fromBlock: 47891979,
        },
      ]
    },
    [CHAIN.BSC]: {
      factories: [
        {
          factory: '0x43646A8e839B2f2766392C1BF8f60F6e587B6960',
          version: 2,
          fromBlock: 26153438,
        },
      ]
    },
  }, {
    holdersRevenueFromRevenue: 1, // 100% revenue
  }),
  methodologyy: {
    Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    Revenue: 'Share of amount of swap fees.',
    ProtocolRevenue: 'No protocol fees.',
    HoldersRevenue: 'All revenue distributed to sJOE stakers',
  },
}
