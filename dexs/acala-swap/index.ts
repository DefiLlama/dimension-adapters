import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    dailyDexes(first:1000, orderBy: TIMESTAMP_DESC) {
      nodes {
        timestamp
        dailyTradeVolumeUSD
      }
    }
  }`
}


const graphQLClient = new GraphQLClient(" https://api.polkawallet.io/acala-dex-subql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  timestamp: string;
  dailyTradeVolumeUSD: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).dailyDexes.nodes;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.timestamp).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { dailyTradeVolumeUSD }) => acc + Number(dailyTradeVolumeUSD), 0)
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp.split('T')[0] === dateString)?.dailyTradeVolumeUSD
  return {
    totalVolume: `${totalVolume / 10 ** 18}`,
    dailyVolume: dailyVolume ? `${Number(dailyVolume) / 10 ** 18}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ACALA]: {
      fetch: fetch,
      start: 1671667200
    },
  },
};

export default adapter;
