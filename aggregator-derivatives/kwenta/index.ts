import { SimpleAdapter, FetchV2, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const PROVIDER_CONFIG = {
  [CHAIN.BASE]: {
    startTimestamp: 1702943900,
    start: '2023-12-18',
    endpoint: "https://subgraph.satsuma-prod.com/404b0c87e4a3/kwenta/base-perps-v3/api",
    query: gql`
      query aggregateStats($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        perpsV3AggregateStats(
          where: { timestamp_gte: $startTimestamp, timestamp_lte: $endTimestamp, period: "86400", marketId: "0" },
          first: 9999, orderBy: timestamp, orderDirection: asc
        ) { timestamp, volume }
      }`,
    volumeField: "perpsV3AggregateStats"
  },
  [CHAIN.OPTIMISM]: {
    startTimestamp: 1671494100,
    start: '2022-12-19',
    endpoint: "https://subgraph.satsuma-prod.com/404b0c87e4a3/kwenta/optimism-perps/api",
    query: gql`
      query aggregateStats($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        futuresAggregateStats(
          where: { timestamp_gte: $startTimestamp, timestamp_lte: $endTimestamp, asset: "0x", period: "86400" },
          first: 9999, orderBy: timestamp, orderDirection: asc
        ) { timestamp, volume }
      }`,
    volumeField: "futuresAggregateStats"
  },
  [CHAIN.ARBITRUM]: {
    startTimestamp: 1696032000,
    start: '2023-09-30',
    endpoint: "https://subgraph.perennial.finance/arbitrum",
    query: gql`
      query aggregateStats($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        marketAccumulations(
          where: { and: [{ bucket: daily, timestamp_gte: $startTimestamp, timestamp_lte: $endTimestamp },
                         { or: [{ shortNotional_gt: "0" }, { longNotional_gt: "0" }] }] },
          first: 9999, orderBy: timestamp, orderDirection: asc      
        ) { timestamp, longNotional, shortNotional }
      }`,
    volumeField: "marketAccumulations"
  }
};

const fetchVolume = async (chainId: CHAIN, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, query } = PROVIDER_CONFIG[chainId];
  try {
    return await new GraphQLClient(endpoint).request(query, { startTimestamp, endTimestamp });
  } catch (e) {
    throw new Error(`Failed to fetch data for chain ${chainId}: ${e.message}`);
  }
};

const calculateVolume = (data: any, volumeField: string): number =>
  data[volumeField].reduce((acc: number, item: any) => 
    acc + (volumeField === "marketAccumulations"
      ? (Number(item.longNotional) + Number(item.shortNotional)) / 1e6
      : Number(item.volume) / 1e18
    ), 0);

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, chain }): Promise<FetchResultV2> => {
  const config = PROVIDER_CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyData = await fetchVolume(chain as CHAIN, startTimestamp || (endTimestamp - 86400), endTimestamp);

  return {
    timestamp: endTimestamp,
    dailyVolume: calculateVolume(dailyData, config.volumeField).toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.fromEntries(
    Object.entries(PROVIDER_CONFIG).map(([chain, config]) => [
      chain,
      { fetch, start: config.start }
    ])
  ),
  pullHourly: true,
  version: 2
};

export default adapter;