import { Chain } from "../../adapters/types";
import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`query getTradingVolumeHistory($timezone: String!, $timestampTo: Int!, $timestampFrom: Int!) {
    getTradingVolumeHistory(timezone: $timezone, timestampTo: $timestampTo, timestampFrom: $timestampFrom) {
      volumes {
        date
        vol
      }
  }
}`
}

const graphQLClient = new GraphQLClient("https://api.cryptocurrencies.ai/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  date: string;
  vol: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const val = {timestampFrom: 1643188527, timestampTo: dayTimestamp, timezone: "UTC"};
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume(), val))?.getTradingVolumeHistory?.volumes;

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.vol

  return {
    dailyVolume: dailyVolume ? dailyVolume.toString() : undefined,
  }
}

const adapter: SimpleAdapter = {
  deadFrom: '2022-11-12',
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2022-01-26',
    },
  },
};

export default adapter;
