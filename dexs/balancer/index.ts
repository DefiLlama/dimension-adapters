import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { BaseAdapter, BreakdownAdapter, ChainEndpoints, FetchResult, FetchResultV2, FetchResultVolume, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { getChainVolume, getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV'),
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('78nZMyM9yD77KG6pFaYap31kJvj8eUWLEntbiVzh8ZKN'),
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('itkjv6Vdh22HtNEPQuk5c9M3T7VeGLQtXxcH8rFi1vc'),
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg'),
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/24660/balancer-polygon-zk-v2/version/latest",
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('7asfmtQA1KYu6CP7YVm5kv4bGxVyfAHEiptt2HMFgkHu'),
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/24660/balancer-base-v2/version/latest",
  [CHAIN.MODE]: "https://api.studio.thegraph.com/query/75376/balancer-mode-v2/version/latest",
  [CHAIN.FRAXTAL]: "https://api.goldsky.com/api/public/project_clwhu1vopoigi01wmbn514m1z/subgraphs/balancer-fraxtal-v2/latest/gn"
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
}
interface IPool {
  id: string;
  swapVolume: string;
}
interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}


const v2Graphs = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResult> => {
      const startTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const fromTimestamp = startTimestamp - 60 * 60 * 24
      const toTimestamp = startTimestamp
      const graphQuery = gql
      `query fees {
        today:poolSnapshots(where: {timestamp:${toTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
        yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
      }`;
      // const blackList = ['0x93d199263632a4ef4bb438f1feb99e57b4b5f0bd0000000000000000000005c2']
      const graphRes: IPoolSnapshot = (await request(endpoints[chain], graphQuery));
      const dailyVolume = graphRes["today"].map((p: IPool) => {
        const yesterdayValue = Number(graphRes.yesterday.find((e: IPool) => e.id.split('-')[0] === p.id.split('-')[0])?.swapVolume || '0')
        if (yesterdayValue === 0) return 0;
        return Number(p.swapVolume) - yesterdayValue;
      }).filter(e => e < 100_000_000).reduce((a: number, b: number) => a + b, 0)

      return {
        dailyVolume: `${dailyVolume}`, timestamp
      };
    };
  };


const v1graphs = getChainVolume({
  graphUrls: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB')
  },
  ...graphParams
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: v1graphs(CHAIN.ETHEREUM),
        start: 1582761600
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
            dateField: 'timestamp',
            volumeField: 'totalSwapVolume'
          }),
        }
      }
    }, {} as BaseAdapter)
  }
}

export default adapter;
