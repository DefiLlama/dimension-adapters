import { SimpleAdapter, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

interface ChainConfig {
  api: string;
  start: string;
  id: string;
  firstDayVolume: number;
}

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-ethereum/1.0.0/gn",
    start: '2023-07-01',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.POLYGON]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-polygon/1.0.0/gn",
    start: '2023-06-30',
    id: '2',
    firstDayVolume: 240.41984714755376,
  },
  [CHAIN.ARBITRUM]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-arbitrum/1.0.0/gn",
    start: '2023-10-05',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.OPTIMISM]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-optimism/1.0.0/gn",
    start: '2024-05-29',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.BSC]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-bsc/1.0.0/gn",
    start: '2024-05-29',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.BASE]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-base/1.0.0/gn",
    start: '2024-05-14',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.MODE]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-mode/1.0.1/gn",
    start: '2024-05-02',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.SCROLL]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-scroll/prod/gn",
    start: '2024-06-27',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.LINEA]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-linea/prod/gn",
    start: '2024-06-27',
    id: '2',
    firstDayVolume: 0,
  },
  [CHAIN.MANTLE]: {
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-linea/prod/gn",
    start: '2024-06-27',
    id: '2',
    firstDayVolume: 0,
  },
};

interface Data {
  start: {
    id: string;
    totalSwapVolume: string;
  };
  end: {
    id: string;
    totalSwapVolume: string;
  };
}

const getVolume = async (options: FetchOptions) => {
  const starttimestamp = options.startOfDay;
  const endtimestamp = starttimestamp + 86400;
  const startId = config[options.chain].id + '-' + starttimestamp;
  const endId = config[options.chain].id + '-' + endtimestamp;

  const query = gql`
  {
      start:swaapSnapshot(id: "${startId}") {
          id
          totalSwapVolume
      }
      end:swaapSnapshot(id: "${endId}") {
          id
          totalSwapVolume
      }
  }
  `;
  const url = config[options.chain].api;
  const graphQLClient = new GraphQLClient(url, { timeout: 3000 });
  const result: Data = await graphQLClient.request(query);
  const dailyVolume = Number(result.end?.totalSwapVolume || 0) - Number(result.start?.totalSwapVolume || 0);
  return {
    dailyVolume: dailyVolume < 0 ? 0 : dailyVolume,
  };
};

const v2graphs = async (_t: any, _tt: any, options: FetchOptions): Promise<FetchResult> => {
  const { dailyVolume } = await getVolume(options);
  return {
    timestamp: options.startOfDay,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: v2graphs,
      start: '2023-07-01',
    },
    [CHAIN.POLYGON]: {
      fetch: v2graphs,
      start: '2023-06-30',
    },
    [CHAIN.ARBITRUM]: {
      fetch: v2graphs,
      start: '2023-10-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: v2graphs,
      start: '2024-05-29',
    },
    [CHAIN.BSC]: {
      fetch: v2graphs,
      start: '2024-05-29',
    },
    [CHAIN.BASE]: {
      fetch: v2graphs,
      start: '2024-05-14',
    },
    [CHAIN.MODE]: {
      fetch: v2graphs,
      start: '2024-05-02',
    },
    [CHAIN.SCROLL]: {
      fetch: v2graphs,
      start: '2024-06-27',
    },
    [CHAIN.LINEA]: {
      fetch: v2graphs,
      start: '2024-06-27',
    },
    [CHAIN.MANTLE]: {
      fetch: v2graphs,
      start: '2024-06-27',
    },
  },
};

export default adapter;
