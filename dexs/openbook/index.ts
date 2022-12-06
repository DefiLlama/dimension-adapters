import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    dailyStats {
      volume {
        interval
        volumeUsd
      }
    }
  }`
}

const graphQLClient = new GraphQLClient("http://51.159.109.243:8079");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  interval: string;
  volumeUsd: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).dailyStats.volume;
  const totalVolume = historicalVolume
  .filter(volItem => (new Date(volItem.interval.split('T')[0]).getTime() / 1000) <= dayTimestamp)
  .reduce((acc, { volumeUsd }) => acc + Number(volumeUsd)/10**6, 0)

const dailyVolume = historicalVolume
  .find(dayItem => (new Date(dayItem.interval.split('T')[0]).getTime() / 1000) === dayTimestamp)?.volumeUsd

  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume ? Number(dailyVolume)/10**6 : 0}`,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: async () => 1669420800,
    },
  },
};

export default adapter;
