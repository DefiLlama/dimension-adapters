import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0xf82cc5f5bd5fb6a2731cf7903087e8e4e953c434'
    ]
  })

  return { dailyFees, }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: 0, },
    [CHAIN.BASE]: { fetch, start: 0, },
    [CHAIN.ARBITRUM]: { fetch, start: 0, },
    [CHAIN.BSC]: { fetch, start: 0, },
    [CHAIN.POLYGON]: { fetch, start: 0, },
    [CHAIN.ERA]: { fetch, start: 0, },
    [CHAIN.OPTIMISM]: { fetch, start: 0, },
    [CHAIN.AVAX]: { fetch, start: 0, },
  },
};
export default adapter;
