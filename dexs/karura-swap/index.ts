import { Chain } from "@defillama/sdk/build/general";
import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`query {
    dailyDexes(orderBy: TIMESTAMP_DESC, first: 1000) {
      nodes {
        dailyTradeVolumeUSD
        timestamp
      }
    }
  }`
}



const graphQLClient = new GraphQLClient("https://api.polkawallet.io/karura-dex-subql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  dailyTradeVolumeUSD: string;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).dailyDexes.nodes;
  const totalVolume = response
    .filter(volItem => (new Date(volItem.timestamp.split('T')[0]).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { dailyTradeVolumeUSD }) => acc + Number(dailyTradeVolumeUSD) / 1e18, 0)

  const dailyVolume = response
    .find(dayItem => (new Date(dayItem.timestamp.split('T')[0]).getTime() / 1000) === dayTimestamp)?.dailyTradeVolumeUSD

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume ? (Number(dailyVolume)/1e18).toString() : "0",
    totalVolume: totalVolume.toString(),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KARURA]: {
      fetch: fetch,
      start: 1656818240,
      customBackfill: customBackfill(CHAIN.KARURA as Chain, () => fetch)
    },
  },
};

export default adapter;
