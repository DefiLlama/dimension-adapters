import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";  
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";


const v3Endpoints = {
  [CHAIN.ERA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-zksync-v3',
  [CHAIN.LINEA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-linea-v3',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon-v3',
};  


const graphsV3 = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    Fees: 100, // User fees are 100% of collected fees
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
  }
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: graphsV3(CHAIN.ERA),
      start: '2024-03-06',
    },
    [CHAIN.LINEA]: {
      fetch: graphsV3(CHAIN.LINEA),
      start: '2024-03-06',
    },
    [CHAIN.SOPHON]: {
      fetch: graphsV3(CHAIN.SOPHON),
      start: '2024-03-06',
    },
  }
}

export default adapter
