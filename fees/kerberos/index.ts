import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { routers } from "./routers";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0xf82cc5f5bd5fb6a2731cf7903087e8e4e953c434'
    ], fromAdddesses: routers
  })

  return { dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-25', },
    [CHAIN.BASE]: { fetch, start: '2024-09-25', },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-09-25', },
    [CHAIN.BSC]: { fetch, start: '2024-09-25', },
    [CHAIN.POLYGON]: { fetch, start: '2024-09-25', },
    [CHAIN.ERA]: { fetch, start: '2024-09-25', },
    [CHAIN.OPTIMISM]: { fetch, start: '2024-09-25', },
    [CHAIN.AVAX]: { fetch, start: '2024-09-25', },
  },
};
export default adapter;
