/**
 * DefiLlama DEX Volume/Fees Adapter for Satsuma DEX
 * 
 * To submit this adapter:
 * 1. Fork https://github.com/DefiLlama/dimension-adapters
 * 2. Create folder: dexs/satsuma/
 * 3. Copy this file to: dexs/satsuma/index.ts
 * 4. Submit a Pull Request
 * 
 * Documentation: https://docs.llama.fi/list-your-project/other-dashboards/listing-your-project
 */

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

// Satsuma DEX Subgraph on Citrea
const endpoints = {
  [CHAIN.CITREA]: "https://api.goldsky.com/api/public/project_cmamb6kkls0v2010932jjhxj4/subgraphs/analytics-mainnet/v1.0.3/gn"
};

// Note: If CHAIN.CITREA doesn't exist in dimension-adapters yet,
// you may need to add it to helpers/chains.ts first:
// export const CHAIN = { ..., CITREA: "citrea" };

const v3Graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayDatas",
    field: "volumeUSD",
    dateField: "date"
  },
  totalFees: {
    factory: "factories",
    field: "totalFeesUSD",
  },
  dailyFees: {
    factory: "algebraDayDatas",
    field: "feesUSD",
    dateField: "date"
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CITREA]: {
      fetch: v3Graphs(CHAIN.CITREA),
      start: 1700000000, // Update with your actual launch timestamp
      meta: {
        methodology: {
          Volume: "Volume is calculated by summing the USD value of all swaps on Satsuma DEX.",
          Fees: "Fees are calculated from the swap fees collected by liquidity providers.",
        }
      }
    }
  }
};

export default adapter;
