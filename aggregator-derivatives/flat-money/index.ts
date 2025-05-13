import { SimpleAdapter, FetchV2, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const CONFIG = {
  [CHAIN.BASE]: {
    startTimestamp: 1721161357,
    endpoint: "https://gateway-arbitrum.network.thegraph.com/api/c26ffec48be89fe71a1af11eb1ae5776/subgraphs/id/HnQeWxwtLY5ZnBS39GmYt84gcHToG7cqjb8KVPApm89h",
    decimals: {
      price: 18,
      amount: 18,
    }
  },
  [CHAIN.OPTIMISM]: {
    startTimestamp: 1744830648,
    endpoint: "https://gateway-arbitrum.network.thegraph.com/api/c26ffec48be89fe71a1af11eb1ae5776/subgraphs/id/C5B1KnswowpwwVGNCVw8Ph7X4rqEuyoZZN7UWjjckEtm",
    decimals: {
      price: 18,
      amount: 8,
    }
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

const calculateOpensVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.entryPrice) / 1e18;
    const marginFormatted = Number(item.margin) / 10 ** amountDecimals;
    const sizeFormatted = Number(item.size) / 10 ** amountDecimals;
    return acc + (marginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

const calculateAdjustsVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.adjustPrice) / 1e18;
    const marginDeltaFormatted = Number(Math.abs(item.marginDelta)) / 10 ** amountDecimals;
    const sizeDeltaFormatted = Number(Math.abs(item.sizeDelta)) / 10 ** amountDecimals;
    return acc + (marginDeltaFormatted + sizeDeltaFormatted) * priceFormatted;
  }, 0);

const calculateClosesVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.closePrice) / 1e18;
    const settledMarginFormatted = Number(item.settledMargin) / 10 ** amountDecimals;
    const sizeFormatted = Number(item.size) / 10 ** amountDecimals;
    return acc + (settledMarginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, chain }): Promise<FetchResultV2> => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const { decimals, } = config;

  const [
    dailyOpensData,
    dailyAdjustsData,
    dailyClosesData,
  ] = await Promise.all([
    fetchVolume(chain as CHAIN, leverageOpensQuery, "leverageOpens", startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, leverageAdjustsQuery, "leverageAdjusts", startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, leverageClosesQuery, "leverageCloses", startTimestamp, endTimestamp),
  ]);

  return {
    dailyVolume: calculateOpensVolume(dailyOpensData, decimals.amount)
        + calculateAdjustsVolume(dailyAdjustsData, decimals.amount)
        + calculateClosesVolume(dailyClosesData, decimals.amount),
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

const leverageOpensQuery = gql`
  query leverageOpens($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
    leverageOpens(
      where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
      first: 1000, orderBy: blockTimestamp, orderDirection: asc
    ) {
      margin,
      size,
      entryPrice
    }
  }`;

const leverageAdjustsQuery = gql`
  query leverageAdjusts($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
    leverageAdjusts(
      where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
      first: 1000, orderBy: blockTimestamp, orderDirection: asc
    ) {
      marginDelta,
      sizeDelta,
      adjustPrice
    }
  }`;

const leverageClosesQuery = gql`
  query leverageCloses($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
    leverageCloses(
      where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
      first: 1000, orderBy: blockTimestamp, orderDirection: asc
    ) {
      settledMargin,
      size,
      closePrice
    }
  }`;

export default adapter;
