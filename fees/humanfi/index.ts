import type { SimpleAdapter } from "../../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { fetchHumanFiData } from "../../dexs/humanfi";
import { CHAIN } from "../../helpers/chains";

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { dailyFees, dailyProtocolRevenue } = await fetchHumanFiData(options)
  return {
    dailyFees,
    dailyProtocolRevenue,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch: fetch,
      start: "2025-04-19",
    },
  },
  methodology: {
    Fees: "Fees are computed based on the 1% (FEE_BPS) cut taken from the input amount.",
    Revenue: "Revenue is equal to the fees collected by the protocol.",
  },
};

export default adapter;
