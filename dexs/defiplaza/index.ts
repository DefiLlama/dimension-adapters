import { FetchResultGeneric, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

type RadixPlazaResponse = {
  date: number,
  stateVersion: number,
  totalValueLockedUSD: number,
  volumeUSD: number,
  feesUSD: number,
  swaps: number
}

const thegraph_endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/omegasyndicate/defiplaza"
};
const radix_enpoint = "https://radix.defiplaza.net/api/defillama/volume";

const graphs = getChainVolume({
  graphUrls: thegraph_endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalTradeVolumeUSD",
  },
  dailyVolume: {
    factory: "dailie",
    field: "tradeVolumeUSD",
    dateField: "date"
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: async () => 1633237008
    },
    [CHAIN.RADIXDLT]: {
      fetch: async (timestamp: number): Promise<FetchResultGeneric> => {
        const daily: RadixPlazaResponse = (await fetchURL(radix_enpoint + `?timestamp=${timestamp}`)).data;
        
        return {
          dailyVolume: daily.volumeUSD,
          dailyFees: daily.feesUSD,
          timestamp
        }
      },
      start: async () => 1700784000,
      // runAtCurrTime: true
    }
  },
};

export default adapter;
