import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import { getUniV3LogAdapter } from "../../helpers/uniswap";

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

// const v2Endpoints = {
//   [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/66247/nile-cl/version/latest/",
// };

// const v2Graphs = getGraphDimensions2({
//   graphUrls: v2Endpoints,
//   totalVolume: {
//     factory: "factories",
//     field: DEFAULT_TOTAL_VOLUME_FIELD,
//   },
//   feesPercent: {
//     type: "fees",
//     HoldersRevenue: 92,
//     ProtocolRevenue: 8,
//     SupplySideRevenue: 0,
//     UserFees: 100, // User fees are 100% of collected fees
//     Revenue: 100 // Revenue is 100% of collected fees
//   }
// });

// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: "100% fees are revenue",
  ProtocolRevenue: "Revenue going to the protocol. 8% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 92% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "0% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (options: FetchOptions) => {
        const adapter = getUniV3LogAdapter({ factory: "0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42", revenueRatio: 1, userFeesRatio: 1, protocolRevenueRatio: 0.08, holdersRevenueRatio: 0.92 })
        const response = await adapter(options)

        const bribesResult = await getBribes(options);
        response.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        return response;
      },
      start: startTimeV2[CHAIN.LINEA],
    },
  },
  methodology,
};

export default adapter;
