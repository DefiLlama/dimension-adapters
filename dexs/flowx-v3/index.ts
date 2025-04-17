import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = (startTime: number, endTime: number) => {
  return gql`
    {
      getClmmVolume(endTime: ${endTime}, startTime: ${startTime})
      getClmmOverviewPoolMetrics24h {
        feeUSD
        txCount
        volumeUSD
      }
    }
  `;
};

const graphQLClient = new GraphQLClient(
  "https://api.flowx.finance/flowx-be/graphql"
);

const getGQLClient = () => {
  return graphQLClient;
};

const fetch = async ({
  fromTimestamp,
  toTimestamp,
}: {
  fromTimestamp: number;
  toTimestamp: number;
}) => {
  const statsRes = await getGQLClient().request(
    getDailyVolume(fromTimestamp * 1000, toTimestamp * 1000)
  );

  return { dailyVolume: statsRes.getClmmVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: "2024-05-10",
    },
  },
};

export default adapter;
