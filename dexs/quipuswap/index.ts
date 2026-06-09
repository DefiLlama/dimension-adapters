import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (options: FetchOptions) => {
  const response: IGraphResponse = (await getGQLClient().request(getHistorical())).overview;

  const daily = response.plotVolume
    .find(dayItem => (new Date(dayItem.time).getTime()) === options.startOfDay);
  const dailyVolume = Number(daily?.value || 0) * Number(daily?.xtzUsdQuoteHistorical || 0);

  return {
    dailyVolume: dailyVolume.toString(),
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TEZOS],
};

export default adapter;
