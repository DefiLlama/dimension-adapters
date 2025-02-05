import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { Adapter, Fetch, FetchResultVolume } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

function fetch(chainId: number): Fetch {
  return async (timestamp: number, _, options): Promise<FetchResultVolume> => {
    const totalVolume = options.createBalances();
    const dailyVolume = options.createBalances();
    const res = await httpGet(
      `https://api.enso.finance/api/v1/volume/${chainId}?timestamp=${timestamp}`,
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
      timestamp,
    };
  };
}

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
