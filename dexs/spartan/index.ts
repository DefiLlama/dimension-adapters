import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { gql, GraphQLClient } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    metricsGlobalDays(first:1000, skip:0) {
      timestamp
      volUSD
    }
  }`
}

const graphQLClient = new GraphQLClient(sdk.graph.modifyEndpoint('9vN1kRac6B224oTjNnFe9vYnJXj5fxaa3ivDfg1hh3v5'));
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  volUSD: string;
  timestamp: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).metricsGlobalDays;
  const totalVolume = historicalVolume
  .filter(volItem => (Number(volItem.timestamp)) <= dayTimestamp)
  .reduce((acc, { volUSD }) => acc + Number(volUSD)/1e18, 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (Number(dayItem.timestamp)) === dayTimestamp)?.volUSD

  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume ? `${Number(dailyVolume)/1e18}` : undefined,
    timestamp: dayTimestamp,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2021-10-04',
      customBackfill: customBackfill(CHAIN.BSC as Chain, () => fetch)
    },
  },
};

export default adapter;
