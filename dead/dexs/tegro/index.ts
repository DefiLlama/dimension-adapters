import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('Cypy2AGAgWwBUjBtQc6GeoGmibLH75v3eVhC9UPXHcHP'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('793XgZSYH8fTiZUMLYAE7mVkGgh9KGQufQhVjRvEdHn3'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('N56YWKqnNPcruU72KM2rxtdFhAAKx2BWgCjZ1gxFokj'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('ExjMBMGp5EDeBBD9Yt43PeZJtKpP29wRs45JXkeCd712'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7xPJ5PFAhXmqacuRQmftnYYixhqhfMvARZ6onXtbX3nQ'),
  },
  factoriesName: "totalVolumes",
  dailyVolume: "volume",
  totalVolume: "volume",
  dayData: "dailyVolume"
});

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2024-01-26',
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: async () => (24 * 60 * 60) * 19600 },
    [CHAIN.POLYGON]: { fetch, start: async () => (24 * 60 * 60) * 19600 },
    [CHAIN.AVAX]: { fetch, start: async () => (24 * 60 * 60) * 19619 },
    [CHAIN.BSC]: { fetch, start: async () => (24 * 60 * 60) * 19619 },
    [CHAIN.ARBITRUM]: { fetch, start: async () => (24 * 60 * 60) * 19619 },
  },
}

export default adapter;
