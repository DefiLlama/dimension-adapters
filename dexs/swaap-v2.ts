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
    api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-mantle/prod/gn",
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
  // A swaapSnapshot accumulates through the day its id names, so a day's volume is its own
  // snapshot minus the previous day's. Reading the next day's snapshot shifted the series one
  // day forward and, in production, read that snapshot while it was still filling up.
  const endtimestamp = options.startOfDay;
  const starttimestamp = endtimestamp - 86400;
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
  const graphQLClient = new GraphQLClient(url, { timeout: 30000 });
  const result: Data = await graphQLClient.request(query);
  const dailyVolume = Number(result.end?.totalSwapVolume || 0) - Number(result.start?.totalSwapVolume || 0);
  return {
    dailyVolume: dailyVolume < 0 ? 0 : dailyVolume,
  };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { dailyVolume } = await getVolume(options);
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2023-07-01',
    },
    [CHAIN.POLYGON]: {
      start: '2023-06-30',
    },
    // [CHAIN.ARBITRUM]: {
    //   start: '2023-10-05',
    // }, -> bad data
    [CHAIN.OPTIMISM]: {
      start: '2024-05-29',
    },
    [CHAIN.BSC]: {
      start: '2024-05-29',
    },
    [CHAIN.BASE]: {
      start: '2024-05-14',
    },
    // [CHAIN.MODE]: {
    //   start: '2024-05-02',
    // }, -> subgraph not available
    // [CHAIN.SCROLL]: {
    //   start: '2024-06-27',
    // }, -> subgraph not available
    // [CHAIN.LINEA]: {
    //   start: '2024-06-27',
    // }, -> subgraph not available
    // [CHAIN.MANTLE]: {
    //   start: '2024-06-27',
    // }, -> subgraph not available
  },
};

export default adapter;
