import { CHAIN } from '../../helpers/chains'
import { joeLiquidityBookExport } from "../../helpers/joe";

export default {
  ...joeLiquidityBookExport({
    [CHAIN.HYPERLIQUID]: {
      factories: [
        {
          factory: '0x4A1EFb00B4Ad1751FC870C6125d917C3f1586600',
          version: 2.2,
          fromBlock: 9069569,
        },
      ]
    },
  }),
  methodology: {
    Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
    Revenue: 'Share of amount of swap fees.',
  },
}
