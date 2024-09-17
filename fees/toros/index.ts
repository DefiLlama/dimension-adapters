import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-optimism/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { managerFee, daoFee, tokenPriceAtLastFeeMint }
      }`,
    feeMintedEventsField: "managerFeeMinteds",
    torosManagerAddress: "0x813123a13d01d3f07d434673fdc89cbba523f14d",
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-polygon/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { managerFee, daoFee, tokenPriceAtLastFeeMint }
      }`,
    feeMintedEventsField: "managerFeeMinteds",
    torosManagerAddress: "0x090e7fbd87a673ee3d0b6ccacf0e1d94fb90da59",
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-arbitrum/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { managerFee, tokenPriceAtLastFeeMint }
      }`,
    feeMintedEventsField: "managerFeeMinteds",
    torosManagerAddress: "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5",
  },
  [CHAIN.BASE]: {
    startTimestamp: 1712227101,
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-base-mainnet/version/latest",
    feeMintedEventsQuery: gql`
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) { managerFee, tokenPriceAtLastFeeMint }
      }`,
    feeMintedEventsField: "managerFeeMinteds",
    torosManagerAddress: "0x5619ad05b0253a7e647bd2e4c01c7f40ceab0879",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, managerAddress: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, feeMintedEventsField } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        manager: managerAddress,
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        first: batchSize,
        skip
      });

      const entries = data[feeMintedEventsField];
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
      const managerFee = Number(item.managerFee);
      const tokenPrice = Number(item.tokenPriceAtLastFeeMint);
      const managerFeeFormatted = managerFee / 1e18;
      const tokenPriceFormatted = tokenPrice / 1e18;
      const managerFeeUsd = managerFeeFormatted * tokenPriceFormatted;
      return acc + managerFeeUsd;
    }, 0);

const fetch = (chain) => {
  return () => {
    return async ({ endTimestamp, startTimestamp }: FetchOptions) => {
      const config = CONFIG[chain];
      if (!config) throw new Error(`Unsupported chain: ${chain}`);

      const [
        dailyFees
      ] = await Promise.all([
        fetchHistoricalFees(chain as CHAIN, config.feeMintedEventsQuery, config.torosManagerAddress, startTimestamp, endTimestamp)
      ]);

      return {
        dailyFees: calculateFees(dailyFees),
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
