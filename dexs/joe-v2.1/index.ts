
import { CHAIN } from '../../helpers/chains'
import { joeLiquidityBookExport } from "../../helpers/joe";

export default {
  ...joeLiquidityBookExport({
    [CHAIN.AVAX]: {
      factories: [
        {
          factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
          version: 2.1,
          fromBlock: 28371397,
        },
      ]
    },
    [CHAIN.ARBITRUM]: {
      factories: [
        {
          factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
          version: 2.1,
          fromBlock: 77473199,
        },
      ]
    },
    [CHAIN.BSC]: {
      factories: [
        {
          factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
          version: 2.1,
          fromBlock: 27099340,
        },
      ]
    },
    [CHAIN.ETHEREUM]: {
      factories: [
        {
          factory: '0xDC8d77b69155c7E68A95a4fb0f06a71FF90B943a',
          version: 2.1,
          fromBlock: 17821282,
        },
      ]
    },
    [CHAIN.MONAD]: {
      factories: [
        {
          factory: '0xe32D45C2B1c17a0fE0De76f1ebFA7c44B7810034',
          version: 2.1,
          fromBlock: 32248561,
        },
      ],
      start: "2025-10-29"
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
