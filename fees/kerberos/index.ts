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

const meta = {
  methodology: {
    Fees: 'Fees paid by users for using Kerberus services.',
    Revenue: 'All fees collected by Kerberus.',
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.BASE]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.BSC]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.POLYGON]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.ERA]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.OPTIMISM]: { fetch, start: '2024-09-25', meta, },
    [CHAIN.AVAX]: { fetch, start: '2024-09-25', meta, },
  },
};
export default adapter;
