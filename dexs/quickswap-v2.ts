import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD } from "../helpers/getUniSubgraphVolume";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd"),
};

const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date",
  },
  feesPercent: {
    type: "volume" as const,
    Fees: 0.3,
    UserFees: 0.3,
    Revenue: 0.05 / 0.3,
    ProtocolRevenue: 0.01/ 0.3,
    SupplySideRevenue: 0.25 / 0.3,
    HoldersRevenue: 0.04 / 0.3,
  }
});

const univ2LogConfig = {
  userFeesRatio: 1,
  revenueRatio: 0.05 / 0.3,
  protocolRevenueRatio: 0.05 / 0.3,
  holdersRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees: "User pays 0.3% fees on each swap.",
    Fees: "0.3% of each swap is collected as trading fees",
    Revenue: "Protocol takes 16.66% of collected fees (0.04% community + 0.01% foundation).",
    ProtocolRevenue: "Foundation receives 3.33% of collected fees (0.01% of swap volume).",
    SupplySideRevenue: "83.33% of collected fees go to liquidity providers (0.25% of swap volume).",
    HoldersRevenue: "Community receives 13.33% of collected fees for buybacks (0.04% of swap volume).",
  },
  adapter: {
    [CHAIN.POLYGON]: { fetch: async (options: FetchOptions) => { return await graphs(options) }, start: '2020-10-08' },
    [CHAIN.BASE]: { fetch: getUniV2LogAdapter({ factory: '0xEC6540261aaaE13F236A032d454dc9287E52e56A', ...univ2LogConfig }), start: '2025-06-14' },
    // [CHAIN.DOGECHAIN]: { fetch: getUniV2LogAdapter({ factory: '0xC3550497E591Ac6ed7a7E03ffC711CfB7412E57F', ...univ2LogConfig }), start: '2023-04-11' },
  },
}

export default adapter;
