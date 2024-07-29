import * as sdk from "@defillama/sdk";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { fetchV2Volume } from "./v2"

const endpoints = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('2bam2XEb91cFqABFPSKj3RiSjpop9HvDt1MnYq5cDX5E'),
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});



const fetch = (chain: Chain) => {
  return async (timestamp: number, chainBlocks: ChainBlocks) => {
    const [v1] = await Promise.all([graphs(chain)(timestamp, chainBlocks)])
    const dailyVolume = Number(v1.dailyVolume);
    return {
      dailyVolume: `${dailyVolume}`, timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1677110400
    },
    [CHAIN.MODE]: {
      fetch: fetchV2Volume,
      start: 1715763701
    },
    [CHAIN.BOB]: {
      fetch: fetchV2Volume,
      start: 1715763701
    }
  },
};

export default adapter;
