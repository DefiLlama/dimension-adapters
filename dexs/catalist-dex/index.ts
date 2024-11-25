import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const getPoolDayDataQuery = gql`
  {
    poolDayDatas {
      volumeUSD
      date
    }
  }
`;

const graphQLClient = new GraphQLClient(
  "https://endurance-subgraph-v2.fusionist.io/subgraphs/name/catalist/exchange-v3-v103"
);
const getGQLClient = () => graphQLClient;

interface IPoolDayData {
  volumeUSD: string;
  date: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = Math.floor(
    new Date(timestamp * 1000).setUTCHours(0, 0, 0, 0) / 1000
  );

  const response = await getGQLClient().request<{
    poolDayDatas: IPoolDayData[];
  }>(getPoolDayDataQuery);

  const totalVolume = response.poolDayDatas.reduce(
    (acc, data) => acc + Number(data.volumeUSD),
    0
  );
  const dailyVolume = response.poolDayDatas.find(
    (data) => data.date === dayTimestamp
  )?.volumeUSD;

  return {
    totalVolume: totalVolume.toFixed(2),
    dailyVolume: dailyVolume ? Number(dailyVolume).toFixed(2) : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ACE]: {
      fetch: fetch,
      start: "2024-11-22",
    },
  },
};

export default adapter;
