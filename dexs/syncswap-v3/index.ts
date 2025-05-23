import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";


const v3Endpoints = {
  [CHAIN.ERA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-zksync-v3',
  [CHAIN.LINEA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-linea-v3',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon-v3',
};


const v3Graphs = getChainVolume2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: 'volumeUSD',
  }
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: v3Graphs(CHAIN.ERA),
      start: '2023-03-23'
    },
    [CHAIN.LINEA]: {
      fetch: v3Graphs(CHAIN.LINEA),
      start: '2023-07-19'
    },
    [CHAIN.SOPHON]: {
      fetch: v3Graphs(CHAIN.SOPHON),
      start: '2024-12-16'
    }
  },
};

export default adapter;
