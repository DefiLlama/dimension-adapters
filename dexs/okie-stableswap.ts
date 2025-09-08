import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.XLAYER]: "https://subgraph.okiedokie.fun/subgraphs/name/stableswap",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 50,
    HoldersRevenue: 0,
    Fees: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 50, // 50% of fees are going to LPs
    Revenue: 50, // Revenue is 50% of collected fees
  },
});

async function fetch(options: FetchOptions) {
  const { dailyVolume } = await v3Graphs(options)
  const dailyFees = (dailyVolume as any) * 0.0001 // 0.01% fee

  return { dailyVolume, dailyFees, dailyHoldersRevenue: 0, dailySupplySideRevenue: dailyFees * 0.5, dailyProtocolRevenue: dailyFees * 0.5, dailyRevenue: dailyFees * 0.5 }
}


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.XLAYER]: {
      start: '2025-09-06',
    },
  },
};

export default adapter;
