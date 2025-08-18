import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { BaseAdapter, BreakdownAdapter, ChainEndpoints, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint("C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV"),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("78nZMyM9yD77KG6pFaYap31kJvj8eUWLEntbiVzh8ZKN"),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint("itkjv6Vdh22HtNEPQuk5c9M3T7VeGLQtXxcH8rFi1vc"),
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint("EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg"),
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/24660/balancer-polygon-zk-v2/version/latest",
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint("7asfmtQA1KYu6CP7YVm5kv4bGxVyfAHEiptt2HMFgkHu"),
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/24660/balancer-base-v2/version/latest",
  [CHAIN.MODE]: "https://api.studio.thegraph.com/query/75376/balancer-mode-v2/version/latest",
  [CHAIN.FRAXTAL]:
    "https://api.goldsky.com/api/public/project_clwhu1vopoigi01wmbn514m1z/subgraphs/balancer-fraxtal-v2/latest/gn",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
};
interface IPoolSnapshot {
  today: { totalSwapVolume: number }[];
  yesterday: { totalSwapVolume: number }[];
}

const v2Graphs = (chain: Chain) => {
  return async ({ getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultV2> => {
    const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);
    try {
      const graphQuery = gql`query fees {
        today:balancers(block: { number: ${toBlock}}) { totalSwapVolume }
        yesterday:balancers(block: { number: ${fromBlock}}) { totalSwapVolume }
      }`;

      const graphRes: IPoolSnapshot = await request(endpoints[chain], graphQuery);

      const totalVolume = graphRes.today.reduce((p, c) => p + c.totalSwapVolume, 0);
      const previousVolume = graphRes.yesterday.reduce((p, c) => p + c.totalSwapVolume, 0);

      const dailyVolume = totalVolume - previousVolume;

      if (dailyVolume < 0) throw new Error(`Daily volume cannot be negative. Current value: ${dailyVolume}`);

      return {
        dailyVolume,
      };
    } catch {
      return {
        dailyVolume: 0,
      };
    }
  };
};

const v1graphs = getChainVolume2({
  graphUrls: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint("93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB"),
  },
  ...graphParams,
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: v1graphs(CHAIN.ETHEREUM),
        start: '2020-02-27',
      },
    },
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: v2Graphs(chain),
          start: getStartTimestamp({
            endpoints,
            chain: chain,
            dailyDataField: `balancerSnapshots`,
            dateField: "timestamp",
            volumeField: "totalSwapVolume",
          }),
        },
      };
    }, {} as BaseAdapter),
  },
};

export default adapter;
