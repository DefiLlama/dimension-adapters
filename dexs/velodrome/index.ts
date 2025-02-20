import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { fetchV2Volume } from "./v2"

const endpoints = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('2bam2XEb91cFqABFPSKj3RiSjpop9HvDt1MnYq5cDX5E'),
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});



const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const [v1] = await Promise.all([graphs(chain)(options)])
    const dailyVolume = Number(v1.dailyVolume);
    return {
      dailyVolume: `${dailyVolume}`,
    }
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-02-23'
    },
    [CHAIN.MODE]: {
      fetch: fetchV2Volume,
      start: '2024-05-15'
    },
    [CHAIN.BOB]: {
      fetch: fetchV2Volume,
      start: '2024-05-15'
    }
  },
};

export default adapter;
