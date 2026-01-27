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
  methodology: {
    Fees: 'Fees paid by users for using Kerberus services.',
    Revenue: 'All fees collected by Kerberus.',
  },
  fetch,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-09-25', },
    [CHAIN.BASE]: { start: '2024-09-25', },
    [CHAIN.ARBITRUM]: { start: '2024-09-25', },
    [CHAIN.BSC]: { start: '2024-09-25', },
    [CHAIN.POLYGON]: { start: '2024-09-25', },
    [CHAIN.ERA]: { start: '2024-09-25', },
    [CHAIN.OPTIMISM]: { start: '2024-09-25', },
    [CHAIN.AVAX]: { start: '2024-09-25', },
  },
};
export default adapter;
