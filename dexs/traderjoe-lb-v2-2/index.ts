
import { CHAIN } from '../../helpers/chains'
import { joeLiquidityBookExport } from "../../helpers/joe";

export default {
  ...joeLiquidityBookExport({
    [CHAIN.AVAX]: {
      factories: [
        {
          factory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
          version: 2.2,
          fromBlock: 46536129,
        },
      ]
    },
    [CHAIN.ARBITRUM]: {
      factories: [
        {
          factory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
          version: 2.2,
          fromBlock: 220345864,
        },
      ]
    },
  }, {
    holdersRevenueFromRevenue: 1, // 100% revenue
  }),
  methodology: {
    Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    Revenue: 'Share of amount of swap fees.',
    ProtocolRevenue: 'No protocol fees.',
    HoldersRevenue: 'All revenue distributed to sJOE stakers',
  },
}
