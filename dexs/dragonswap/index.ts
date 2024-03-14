import { Chain } from "@defillama/sdk/build/types";
import { BaseAdapter, BreakdownAdapter, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.KLAYTN]: "https://graph.dgswap.io/subgraphs/name/dragonswap/exchange-v2",
};

const v3Endpoint = {
  [CHAIN.KLAYTN]: "https://graph.dgswap.io/subgraphs/name/dragonswap/exchange-v3",
};

const VOLUME_USD = "volumeUSD";

const startTimes = {
  [CHAIN.KLAYTN]: 1707297572,
} as IJSON<number>;

const v3StartTimes = {
  [CHAIN.KLAYTN]: 1707297572,
} as IJSON<number>;

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.06% of each swap.",
  SupplySideRevenue: "LPs receive 0.24% of the fees.",
  HoldersRevenue: "",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.KLAYTN]: {
      "origin": "https://dgswap.io",
    },
  },
  totalVolume: {
    factory: "pancakeFactories"
  },
  dailyVolume: {
    factory: "pancakeDayData"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.3,
    ProtocolRevenue: 0.06,
    HoldersRevenue: 0,
    UserFees: 0.3,
    SupplySideRevenue: 0.24,
    Revenue: 0.06
  }
});

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD
  },
  totalFees: {
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD"
  },
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphs(chain as Chain),
        start: startTimes[chain],
        meta: {
          methodology
        }
      }
      return acc
    }, {} as BaseAdapter),
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graph(chain),
        start: v3StartTimes[chain],
      }
      return acc
    }, {} as BaseAdapter),
  },
};

export default adapter;
