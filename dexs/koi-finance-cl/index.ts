import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      start: 1679529600,
      fetch: getUniV3LogAdapter({ factory: '0x488A92576DA475f7429BC9dec9247045156144D3', userFeesRatio: 1 }),
    }
  },
  methodology: {
    Fees: 'Total swap fees paid by users.',
    UserFees: 'Total swap fees paid by users.',
  }
}

export default adapter
