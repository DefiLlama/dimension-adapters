import { Adapter, FetchOptions } from "../../adapters/types";
import { ARBITRUM, CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
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
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/ramsesexchange/concentrated-liquidity-graph",
};

const VOLUME_USD = "volumeUSD";

const v2Graphs = getGraphDimensions({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 75,
    ProtocolRevenue: 5,
    SupplySideRevenue: 20,
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 80 // Revenue is 100% of collected fees
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
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        const v2Result = await v2Graphs(ARBITRUM)(options)
        const bribesResult = await getBribes(options);
        v2Result.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        return v2Result;
      },
      start: startTimeV2[CHAIN.ARBITRUM],
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
