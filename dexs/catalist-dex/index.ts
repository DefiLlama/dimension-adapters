import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const graphQLClient = new GraphQLClient(
  "https://endurance-subgraph-v2.fusionist.io/subgraphs/name/catalist/exchange-v3-v103"
);
const getGQLClient = () => graphQLClient;

interface IPoolDayData {
  volumeUSD: string;
  date: number;
}

const fetch = async (_t: number, _: any, options: FetchOptions) => {
  const dayId = Math.floor(options.startOfDay / 86400);
  const getPoolDayDataQuery = gql`
    {
      pancakeDayData(id: ${dayId}) {
        volumeUSD
        date
      }
      factories {
        totalVolumeUSD
      }
    }
  `;
  const response = await getGQLClient().request<{
    pancakeDayData: IPoolDayData;
    factories: Array<{ totalVolumeUSD: string }>;
  }>(getPoolDayDataQuery);

  const totalVolume = response.factories[0].totalVolumeUSD;
  const dailyVolume = response.pancakeDayData?.volumeUSD;

  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume ? Number(dailyVolume).toFixed(2) : undefined,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ACE]: {
      fetch: fetch,
      start: "2024-11-22",
    },
  },
};

export default adapter;
