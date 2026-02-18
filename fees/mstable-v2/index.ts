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

const CONFIG: any = {
  [CHAIN.ETHEREUM]: {
    endpoint: sdk.graph.modifyEndpoint("HSPZATdnDvYRNPBJm7eSrzkTeRZqhqYvy7c3Ngm9GCTL"),
    mstableManagerAddress: "0x3dd46846eed8D147841AE162C8425c08BD8E1b41",
  },
};

const fetchHistoricalFees = async (chainId: string, query: string, dataField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, mstableManagerAddress } = CONFIG[chainId];

  let allData: Array<any> = [];
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
    } catch (e: any) {
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

const fetch = async (_1: any, _2: any, options: FetchOptions) => {
  const config = CONFIG[options.chain];
  if (!config) throw new Error(`Unsupported chain: ${options.chain}`);

  const dailyManagerFeesEvents = await fetchHistoricalFees(options.chain, queryManagerFeeMinteds, 'managerFeeMinteds', options.startTimestamp, options.endTimestamp);
  const dailyEntryFeesEvents = await fetchHistoricalFees(options.chain, queryEntryFeeMinteds, 'entryFeeMinteds', options.startTimestamp, options.endTimestamp);
  const dailyExitFeesEvents = await fetchHistoricalFees(options.chain, queryExitFeeMinteds, 'exitFeeMinteds', options.startTimestamp, options.endTimestamp);

  const managerFees = calculateManagerFees(dailyManagerFeesEvents);
  const entryFees = calculateEntryFees(dailyEntryFeesEvents);
  const exitFees = calculateExitFees(dailyExitFeesEvents);

  const dailyFees = managerFees + entryFees + exitFees;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees: 'All fees generated from mStable vaults.',
  Revenue: 'All revenue collected by the mStable protocol.',
  ProtocolRevenue: 'All revenue collected by the mStable protocol.',
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  chains: [CHAIN.ETHEREUM],
  start: '2025-08-12',
  version: 2,
  doublecounted: true,
}

export default adapter;
