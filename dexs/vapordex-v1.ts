import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { univ2Adapter2 } from "../helpers/getUniSubgraphVolume";

const avaxAdapter = univ2Adapter2({
  endpoints: {
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint(
      "B6Tur5gXGCcswG8rEtmwfjBqeyDXCDUQSwM9wUXHoui5"
    ),
  },
  factoriesName: "dexAmmProtocols",
  totalVolume: "cumulativeVolumeUSD",
})

const apechainAdapter = univ2Adapter2({
  endpoints: {
    [CHAIN.APECHAIN]: "https://api.goldsky.com/api/public/project_cloh4i8580dwo2nz7brhf4r6p/subgraphs/vapordex-v1-apechain/1.0.0/gn",
  },
  factoriesName: "uniswapFactories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: { fetch: avaxAdapter, start: '2023-09-19' },
    [CHAIN.APECHAIN]: { fetch: apechainAdapter, start: '2023-09-19' },
  },
};

export default adapter;
