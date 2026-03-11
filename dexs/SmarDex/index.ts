import { ethers, Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph";
import { CHAIN_CONFIG, getGraphHeaders } from "./config";
import { USDNVolumeService } from "./usdn-volume";

const graphs = getGraphDimensions2({
  graphUrls: CHAIN_CONFIG.GRAPH_URLS,
  graphRequestHeaders: getGraphHeaders(),
  totalVolume: {
    factory: "smardexFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(CHAIN_CONFIG.GRAPH_URLS).forEach((chain: string) => {
  const subgraphFetching = graphs;

  adapter.adapter![chain] = {
    fetch: async (options: FetchOptions) => {
      try {
        const smardexDimensions = await subgraphFetching(options);

        if (chain === CHAIN.ETHEREUM) {
          const volumeService = new USDNVolumeService(options);
          const usdnVolume = await volumeService.getUsdnVolume();
          smardexDimensions.dailyVolume =
            usdnVolume + Number(smardexDimensions.dailyVolume);
        }

        return {
          ...smardexDimensions,
        };
      } catch (error) {
        console.error(`Error fetching data for ${chain}:`, error);
        return subgraphFetching(options)
      }
    },

    start: CHAIN_CONFIG.START_TIMES[chain],
  };
});

export default adapter;
