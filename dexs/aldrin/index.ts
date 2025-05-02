import { Chain } from "@defillama/sdk/build/general";
import { gql, GraphQLClient } from "graphql-request";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";

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

  const totalVolume = historicalVolume
  .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
  .reduce((acc, { vol }) => acc + Number(vol), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.vol

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume ? dailyVolume.toString() : undefined,
    totalVolume: totalVolume.toString(),
  }
}

const adapter: SimpleAdapter = {
  deadFrom: '2022-11-12',
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2022-01-26',
      customBackfill: customBackfill(CHAIN.SOLANA as Chain, () => fetch)
    },
  },
};

export default adapter;
