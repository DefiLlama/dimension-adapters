import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/fulcrom/stats-prod",
  // [CHAIN.ERA]: "https://api.studio.thegraph.com/query/52869/stats-prod/version/latest",
  [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/fulcrom-stats-mainnet/prod/gn"
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
    }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    burn: string;
    liquidation: string;
    margin: string;
    mint: string;
    swap: string;
  }>;
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    id: "daily:" + String(options.startOfDay),
    period: "daily",
  });
  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(
          Number(
            Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
              String(Number(sum) + Number(element))
            )
          ) *
          10 ** -30
        )
        : undefined,
  };
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.CRONOS]: 1677470400,
  [CHAIN.ERA]: 1696496400,
  [CHAIN.CRONOS_ZKEVM]: 1723698700,
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: startTimestamps[chain],
      },
    };
  }, {}),
};

export default adapter;
