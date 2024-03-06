import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/spookyswap";
import {
  Adapter,
  BaseAdapter,
  BreakdownAdapter,
  IJSON,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions } from "../helpers/getUniSubgraph";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [CHAIN.BSC]:
    "https://api.thegraph.com/subgraphs/name/miguelangelrm/kyotoswap-exchange",
};

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "pancakeFactories",
  },
  dailyVolume: {
    factory: "pancakeDayData",
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25,
    ProtocolRevenue: 0.08,
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    Revenue: 0.0225, // 0.25
  },
});

const startTimes = {
  [CHAIN.BSC]: 1670113423,
} as IJSON<number>;

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user.",
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    acc[chain] = {
      fetch: graphs(chain as Chain),
      start: startTimes[chain],
      meta: {
        methodology,
      },
    };
    return acc;
  }, {} as BaseAdapter)
}

export default adapter
