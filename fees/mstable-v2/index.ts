import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import * as sdk from "@defillama/sdk";

const queryManagerFeeMinteds = `
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { managerFee, tokenPriceAtFeeMint, pool, manager, block }
      }`

const queryEntryFeeMinteds = `
      query entryFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        entryFeeMinteds(
          where: { managerAddress: $manager, time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { entryFeeAmount, tokenPrice }
      }`

const queryExitFeeMinteds = `
      query exitFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        exitFeeMinteds(
          where: { managerAddress: $manager, time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { exitFeeAmount, tokenPrice }
      }`

const CONFIG = {
  [CHAIN.ETHEREUM]: {
    endpoint: sdk.graph.modifyEndpoint("HSPZATdnDvYRNPBJm7eSrzkTeRZqhqYvy7c3Ngm9GCTL"),
    mstableManagerAddress: "0x3dd46846eed8D147841AE162C8425c08BD8E1b41",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, dataField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, mstableManagerAddress } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        manager: mstableManagerAddress,
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        first: batchSize,
        skip
      });

      const entries = data[dataField];
      if (entries.length === 0) break;

      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;
    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

const calculateManagerFees = (dailyFees: any): number =>
  dailyFees.reduce((acc: number, dailyFeesDto: any) => {
    const managerFee = Number(dailyFeesDto.managerFee);
    const tokenPrice = Number(dailyFeesDto.tokenPriceAtFeeMint);
    const managerFeeFormatted = managerFee / 1e18;
    const tokenPriceFormatted = tokenPrice / 1e18;
    const managerFeeUsd = managerFeeFormatted * tokenPriceFormatted;
    return acc + managerFeeUsd;
  }, 0);

const calculateEntryFees = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const entryFee = Number(item.entryFeeAmount);
    const tokenPrice = Number(item.tokenPrice);
    const entryFeeFormatted = entryFee / 1e18;
    const tokenPriceFormatted = tokenPrice / 1e18;
    const result = entryFeeFormatted * tokenPriceFormatted;
    return acc + result;
  }, 0);

const calculateExitFees = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const exitFee = Number(item.exitFeeAmount);
    const tokenPrice = Number(item.tokenPrice);
    const exitFeeFormatted = exitFee / 1e18;
    const tokenPriceFormatted = tokenPrice / 1e18;
    const result = exitFeeFormatted * tokenPriceFormatted;
    return acc + result;
  }, 0);

const fetch = async ({ chain, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyManagerFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryManagerFeeMinteds, 'managerFeeMinteds', startTimestamp, endTimestamp);
  const dailyEntryFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryEntryFeeMinteds, 'entryFeeMinteds', startTimestamp, endTimestamp);
  const dailyExitFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryExitFeeMinteds, 'exitFeeMinteds', startTimestamp, endTimestamp);

  const managerFees = calculateManagerFees(dailyManagerFeesEvents);
  const entryFees = calculateEntryFees(dailyEntryFeesEvents);
  const exitFees = calculateExitFees(dailyExitFeesEvents);

  const dailyFees = managerFees + entryFees + exitFees;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    timestamp: endTimestamp,
  };
}

const methodology = {
  Fees: 'All fees generated from mStable vaults.',
  Revenue: 'All revenue collected by the mStable protocol.',
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-08-12', },
  },
  version: 2
}

export default adapter;
