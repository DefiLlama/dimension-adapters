import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getHistorical = () => {
  return gql`query InfoTabs {
      overview {
        plotVolume {
          time
          value
          xtzUsdQuoteHistorical
        }
    }
  }`
}

const graphQLClient = new GraphQLClient("https://analytics-api.quipuswap.com/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  plotVolume: Array<{
    time: number,
    value: number,
    xtzUsdQuoteHistorical: string;
  }>
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse = (await getGQLClient().request(getHistorical())).overview;

  const totalVolume = response.plotVolume
    .filter(volItem => (new Date(volItem.time).getTime()) <= dayTimestamp)
    .reduce((acc, { value, xtzUsdQuoteHistorical }) => acc + (Number(value || 0) * Number(xtzUsdQuoteHistorical || 0)), 0)
  const daily = response.plotVolume
    .find(dayItem => (new Date(dayItem.time).getTime()) === dayTimestamp);
  const dailyVolume = Number(daily?.value || 0) * Number(daily?.xtzUsdQuoteHistorical || 0);

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume.toString(),
    totalVolume: totalVolume.toString(),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetch,
    },
  },
};

export default adapter;
