import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph"

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.LINEA]: 1705968000,
}

const getBribes = async ({ fromTimestamp, toTimestamp, createBalances, getFromBlock, }: FetchOptions): Promise<any> => {
  const fromBlock = await getFromBlock()
  const bribes = createBalances();
  const bribes_delta = createBalances();
  await fees_bribes(fromBlock, toTimestamp, bribes_delta);
  await fees_bribes(fromBlock, fromTimestamp, bribes);
  bribes.subtract(bribes_delta);
  return {
    timestamp: toTimestamp,
    dailyBribesRevenue: bribes,
  };
};

const v2Endpoints = {
  [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/66247/nile-cl/version/latest/",
};

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
<<<<<<< HEAD
    HoldersRevenue: 92,
    ProtocolRevenue: 2,
    SupplySideRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 100 // Revenue is 100% of collected fees
=======
    HoldersRevenue: 72,
    ProtocolRevenue: 8,
    SupplySideRevenue: 20,
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 80 // Revenue is 100% of collected fees
>>>>>>> a64e2d3e7fcc74d68f14ab6d1a88872780fca6d5
  }
});
// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (options: FetchOptions) => {
        const v2Result = await v2Graphs(CHAIN.LINEA)(options)
        const bribesResult = await getBribes(options);
        v2Result.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        return v2Result;
      },
      start: startTimeV2[CHAIN.LINEA],
      meta: {
        methodology: {
          ...methodology,
          UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
        },
      },
    },
  },
};

export default adapter;
