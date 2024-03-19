import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.MANTA]: "https://api.goldsky.com/api/public/project_clpm9wvhralny01szb1oa4pue/subgraphs/monocerus/1.2.0/gn"
};

const v3Graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
    dateField: "date"
  },
  dailyFees: {
    factory: "uniswapDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 0% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 0% of collected fees
  }
});

const adapter: Adapter = {
  version: 2,
    adapter: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.MANTA]: {
        fetch: v3Graphs(CHAIN.MANTA),
        start:  1703548800
      }
    }
};

export default adapter;
