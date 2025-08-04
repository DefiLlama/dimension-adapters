import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const getDailyVolume = () => {
  return gql`{
    dailyDexes(first:50, orderBy: TIMESTAMP_DESC) {
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
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).dailyDexes.nodes;
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp.split('T')[0] === dateString)?.dailyTradeVolumeUSD
  if (Number(Number(dailyVolume) / 10 ** 18) > 1_000_000_000) throw new Error("Daily volume is too high");
  return {
    dailyVolume: dailyVolume ? `${Number(dailyVolume) / 10 ** 18}` : undefined,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ACALA]: {
      fetch,
      start: '2022-12-22'
    },
  },
};

export default adapter;
