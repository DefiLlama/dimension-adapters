import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-base-stats/0.0.2/gn",
  [CHAIN.MODE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-mode-stats/0.0.1/gn",
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
      id: String(options.startOfDay) + ":daily",
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
          : 0,
    };
  };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BASE]: 1694304000,
  [CHAIN.MODE]: 1720627435,
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
