import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { Adapter, FetchResultV2, FetchV2 } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

function fetch(chainId: number): FetchV2 {
  return async ({ endTimestamp, createBalances }): Promise<FetchResultV2> => {
    const totalVolume = createBalances();
    const dailyVolume = createBalances();
    const res = await httpGet(
      `https://api.enso.finance/api/v1/volume/${chainId}?timestamp=${endTimestamp}`,
      {
        headers: {
          Authorization: `Bearer ${getEnv("ENSO_API_KEY")}`,
        },
      },
    );

    totalVolume.addUSDValue(res.totalVolume);
    dailyVolume.addUSDValue(res.dailyVolume);

    return {
      totalVolume,
      dailyVolume,
    };
  };
}

const adapter: Adapter = {
  version: 2,
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
