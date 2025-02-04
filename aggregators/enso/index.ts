import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchResultVolume } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

function fetch(chainId: number) {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const res = await httpGet(
      `https://api.enso.finance/api/v1/volume/${chainId}`,
      {
        headers: {
          Authorization: `Bearer ${getEnv("ENSO_API_KEY")}`,
        },
      },
    );
    return {
      totalVolume: new BigNumber(res.value).toFixed(2),
      timestamp: timestamp,
    };
  };
}

// TODO: Choose correct start timestamps
const adapter: any = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: "2023-03-31",
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(10),
      start: "2023-03-31",
    },
    //[CHAIN.BSC]: {
    //  fetch: fetch(56),
    //  start: "2023-03-31",
    //},
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: "2023-03-31",
    },
    //[CHAIN.ZKSYNC]: {
    //  fetch: fetch(324),
    //  start: "2023-03-31",
    //},
    [CHAIN.BASE]: {
      fetch: fetch(8453),
      start: "2023-03-31",
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(42161),
      start: "2023-03-31",
    },
    //[CHAIN.AVAX]: {
    //  fetch: fetch(43114),
    //  start: "2023-03-31",
    //},
    [CHAIN.LINEA]: {
      fetch: fetch(59144),
      start: "2023-03-31",
    },
  },
};

export default adapter;
