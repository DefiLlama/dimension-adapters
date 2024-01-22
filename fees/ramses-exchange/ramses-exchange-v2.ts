import { Adapter, SimpleAdapter, FetchResultFees, BaseAdapter } from "../../adapters/types";
import { ARBITRUM, CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import { getBlock } from '../../helpers/getBlock';
import {
    getGraphDimensions,
    DEFAULT_DAILY_VOLUME_FACTORY,
    DEFAULT_TOTAL_VOLUME_FIELD,
  } from "../../helpers/getUniSubgraph"

type TStartTime = {
  [key: string]: number;
}
const startTimeV2:TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
}

const getBribes = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const fromBlock = (await getBlock(timestamp, CHAIN.ARBITRUM, {}));
  const bribes = await fees_bribes(fromBlock, timestamp);
  const fromBlock_delta = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
  const bribes_delta = await fees_bribes(fromBlock_delta, fromTimestamp);
  return {
    dailyBribesRevenue: `${ bribes_delta - bribes}`,
    timestamp: timestamp,
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
      adapter: {
        [CHAIN.ARBITRUM]: {
          fetch: async (timestamp: number, chainBlocks: any) => {
            const v2Result = await v2Graphs(ARBITRUM)(timestamp, chainBlocks); // Pass chainBlocks as the second argument
            const bribesResult = await getBribes(timestamp);
    
            // Combine or process the results as needed
            const combinedResult = {
              ...v2Result,
              ...bribesResult,
            };
    
            return combinedResult;
          },
          start: async () => startTimeV2[CHAIN.ARBITRUM],
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
