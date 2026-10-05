import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../../adapters/types";
import { gql, GraphQLClient } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// MetricsGlobalDay id/timestamp = UTC midnight of the day; filter on it instead of paging the whole history
const getDailyVolume = (dayTimestamp: number) => {
  return gql`{
    metricsGlobalDays(where: { timestamp: ${dayTimestamp} }) {
      timestamp
      volUSD
    }
    _meta { block { timestamp } }
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

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const response = await getGQLClient().request(getDailyVolume(options.startOfDay));
  // a lagging subgraph would return a partial (or missing) day row
  if (Number(response._meta.block.timestamp) < options.endTimestamp)
    throw new Error(`spartan subgraph not synced past ${options.dateString}`)
  const historicalVolume: IGraphResponse[] = response.metricsGlobalDays;

  // no row once synced = no pool activity that day
  const dailyVolume = historicalVolume
    .find(dayItem => (Number(dayItem.timestamp)) === options.startOfDay)?.volUSD

  return {
    dailyVolume: dailyVolume ? `${Number(dailyVolume)/1e18}` : 0,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: '2021-10-04',
  methodology: {
    Volume: 'Sum of the SPARTA side of every pool swap, valued in USD at the subgraph SPARTA price (average of the SPARTA/USDT, SPARTA/USDC and SPARTA/BUSD pools holding over 100k SPARTA). All pools are paired with SPARTA, so a token-to-token trade swaps through two pools and is counted in both.',
  },
};

export default adapter;
