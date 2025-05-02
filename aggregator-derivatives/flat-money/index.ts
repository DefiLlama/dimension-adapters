import { SimpleAdapter, FetchV2, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const CONFIG = {
  [CHAIN.BASE]: {
    startTimestamp: 1721161357,
    endpoint: "https://api.studio.thegraph.com/query/48129/flatcoin-base/version/latest",
    leverageOpensQuery: gql`
      query leverageOpens($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageOpens(
          where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
          margin,
          size,
          entryPrice
        }
      }`,
    leverageAdjustsQuery: gql`
      query leverageAdjusts($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageAdjusts(
          where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
          marginDelta,
          sizeDelta,
          adjustPrice
        }
      }`,
    leverageClosesQuery: gql`
      query leverageCloses($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageCloses(
          where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
          settledMargin,
          size,
          closePrice
        }
      }`,
    leverageOpensField: "leverageOpens",
    leverageAdjustsField: "leverageAdjusts",
    leverageClosesField: "leverageCloses"
  },
};

const fetchVolume = async (chainId: CHAIN, query: string, volumeField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        startTimestamp,
        endTimestamp,
        first: batchSize,
        skip
      });

      const entries = data[volumeField];
      if (entries.length === 0) break;
      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;

      await sleep(500);
    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

const calculateOpensVolume = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.entryPrice) / 1e18;
    const marginFormatted = Number(item.margin) / 1e18;
    const sizeFormatted = Number(item.size) / 1e18;
    return acc + (marginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

const calculateAdjustsVolume = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.adjustPrice) / 1e18;
    const marginDeltaFormatted = Number(Math.abs(item.marginDelta)) / 1e18;
    const sizeDeltaFormatted = Number(Math.abs(item.sizeDelta)) / 1e18;
    return acc + (marginDeltaFormatted + sizeDeltaFormatted) * priceFormatted;
  }, 0);

const calculateClosesVolume = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.closePrice) / 1e18;
    const settledMarginFormatted = Number(item.settledMargin) / 1e18;
    const sizeFormatted = Number(item.size) / 1e18;
    return acc + (settledMarginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, chain }): Promise<FetchResultV2> => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const [
    dailyOpensData,
    dailyAdjustsData,
    dailyClosesData,
    totalOpensData,
    totalAdjustsData,
    totalClosesData
  ] = await Promise.all([
    fetchVolume(chain as CHAIN, config.leverageOpensQuery, config.leverageOpensField, startTimestamp || (endTimestamp - 86400), endTimestamp),
    fetchVolume(chain as CHAIN, config.leverageAdjustsQuery, config.leverageAdjustsField, startTimestamp || (endTimestamp - 86400), endTimestamp),
    fetchVolume(chain as CHAIN, config.leverageClosesQuery, config.leverageClosesField, startTimestamp || (endTimestamp - 86400), endTimestamp),
    fetchVolume(chain as CHAIN, config.leverageOpensQuery, config.leverageOpensField, config.startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, config.leverageAdjustsQuery, config.leverageAdjustsField, config.startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, config.leverageClosesQuery, config.leverageClosesField, config.startTimestamp, endTimestamp),
  ]);

  return {
    dailyVolume: calculateOpensVolume(dailyOpensData)
        + calculateAdjustsVolume(dailyAdjustsData)
        + calculateClosesVolume(dailyClosesData),
    totalVolume: calculateOpensVolume(totalOpensData)
        + calculateAdjustsVolume(totalAdjustsData)
        + calculateClosesVolume(totalClosesData)
  };
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const adapter: SimpleAdapter = {
  adapter: Object.fromEntries(
    Object.entries(CONFIG).map(([chain, config]) => [
      chain,
      { fetch, start: config.startTimestamp }
    ])
  ),
  version: 2
};

export default adapter;
