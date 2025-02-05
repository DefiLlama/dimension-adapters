import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { Adapter, FetchResultVolume } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

function fetch(chainId: number) {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const res = await httpGet(
      `https://api.enso.finance/api/v1/volume/${chainId}?timestamp=${timestamp}`,
      {
        headers: {
          Authorization: `Bearer ${getEnv("ENSO_API_KEY")}`,
        },
      },
    );

    return {
      totalVolume: new BigNumber(res.totalVolume).toFixed(2),
      dailyVolume: new BigNumber(res.dailyVolume).toFixed(2),
      timestamp: timestamp,
    };
  };
}

// TODO: Choose correct start timestamps
const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: "2023-06-22",
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(10),
      start: "2023-09-19",
    },
    [CHAIN.BSC]: {
      fetch: fetch(56),
      start: "2023-09-20",
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: "2023-09-05",
    },
    [CHAIN.BASE]: {
      fetch: fetch(8453),
      start: "2023-12-24",
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(42161),
      start: "2023-09-11",
    },
    [CHAIN.LINEA]: {
      fetch: fetch(59144),
      start: "2023-12-15",
    },
  },
};

export default adapter;
