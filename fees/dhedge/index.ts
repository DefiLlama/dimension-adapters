import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const PROVIDER_CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-optimism/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { daoFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { daoFee, tokenPriceAtLastFeeMint }
      }`,
    managerFeeMintedEventsField: "managerFeeMinteds",
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-polygon/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { daoFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { daoFee, tokenPriceAtLastFeeMint }
      }`,
    managerFeeMintedEventsField: "managerFeeMinteds",
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-arbitrum/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { daoFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { daoFee, tokenPriceAtLastFeeMint }
      }`,
    managerFeeMintedEventsField: "managerFeeMinteds",
  },
  [CHAIN.BASE]: {
    startTimestamp: 1712227101,
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-base-mainnet/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { daoFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { daoFee, tokenPriceAtLastFeeMint }
      }`,
    managerFeeMintedEventsField: "managerFeeMinteds",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, volumeField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = PROVIDER_CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
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

const calculateFees = (data: any): number =>
    data.reduce((acc: number, item: any) => {
      const daoFee = Number(item.daoFee);
      const tokenPrice = Number(item.tokenPriceAtLastFeeMint);
      const daoFeeInEth = daoFee / 1e18;
      const tokenPriceInEth = tokenPrice / 1e18;
      const result = daoFeeInEth * tokenPriceInEth;
      return acc + result;
    }, 0);

const fetch = (chain) => {
  return () => {
    return async ({ endTimestamp, startTimestamp }: FetchOptions) => {
      const config = PROVIDER_CONFIG[chain];
      if (!config) throw new Error(`Unsupported chain: ${chain}`);

      const [
        dailyFees
      ] = await Promise.all([
        fetchHistoricalFees(chain as CHAIN, config.feeMintedEventsQuery, config.managerFeeMintedEventsField, startTimestamp, endTimestamp)
      ]);

      return {
        dailyFees: String(calculateFees(dailyFees)),
        dailyRevenue: calculateFees(dailyFees),
        timestamp: endTimestamp,
      };
    }
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM)(),
      start: 1638446653,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON)(),
      start: 1627560253,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM)(),
      start: 1679918653,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE)(),
      start: 1703073853,
    },
  },
  version: 2
}

export default adapter;
