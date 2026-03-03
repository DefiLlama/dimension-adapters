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

// gql`
//   query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
//     managerFeeMinteds(
//       where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
//       first: 1000, orderBy: blockTimestamp, orderDirection: asc
//     ) { managerFee, daoFee, tokenPriceAtLastFeeMint }
//   }`,
// if graph goes down, can be pulled via event logs, example:
// https://optimistic.etherscan.io/tx/0x265e1eeb9a2c68ef8f58fe5e1d7e3f1151dd5e6686d4147445bf1bd8895deb38#eventlog check topic: 0x755a8059d66d8d243bc9f6913f429a811f154599d0538bb0b6a2ac23f23d2ccd
/* const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  let torosManagerAddress = CONFIG[chain].torosManagerAddress.toLowerCase();
  const dailyFees = createBalances();
  const logs = await getLogs({
    eventAbi: 'event ManagerFeeMinted (address pool, address manager, uint256 available, uint256 daoFee, uint256 managerFee, uint256 tokenPriceAtLastFeeMint)',
  });
  logs.forEach(i => {
    if (i.manager.toLowerCase() !== torosManagerAddress) return;
    dailyFees.addUSDValue(i.daoFee.toString() * i.tokenPriceAtLastFeeMint.toString() / 1e36)
  });

  return { dailyFees, dailyRevenue: dailyFees };
} */
const CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: sdk.graph.modifyEndpoint("A5noWtBtNTZBeueunF94spSnfyL1GP7hsuRv3r6nVvyD"),
    torosManagerAddress: "0x813123a13d01d3f07d434673fdc89cbba523f14d",
  },
  [CHAIN.POLYGON]: {
    endpoint: sdk.graph.modifyEndpoint("AutWgquMFvUVEKVuqE55GWxAHDvRF7ZYfRMU1Bcqo5DW"),
    torosManagerAddress: "0x090e7fbd87a673ee3d0b6ccacf0e1d94fb90da59",
  },
  [CHAIN.ARBITRUM]: {
    endpoint: sdk.graph.modifyEndpoint("C4LBuTkbXYoy2vSPRA5crGdWR4CAo3W64Rf1Won3fZio"),
    torosManagerAddress: "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5",
  },
  [CHAIN.BASE]: {
    endpoint: sdk.graph.modifyEndpoint("AN6TxZwi5JwpPgPKbU16E5jpK5YE6Efuq2iavqVaYQeF"),
    torosManagerAddress: "0x5619ad05b0253a7e647bd2e4c01c7f40ceab0879",
  },
  [CHAIN.ETHEREUM]: {
    endpoint: sdk.graph.modifyEndpoint("HSPZATdnDvYRNPBJm7eSrzkTeRZqhqYvy7c3Ngm9GCTL"),
    torosManagerAddress: "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, dataField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, torosManagerAddress } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        manager: torosManagerAddress,
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
  Fees: 'All fees generated from Toros vaults.',
  Revenue: 'All revenue collected by the Toros protocol.',
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  adapter: {
    [CHAIN.OPTIMISM]: { start: '2021-12-02', },
    [CHAIN.POLYGON]: { start: '2021-07-29', },
    [CHAIN.ARBITRUM]: { start: '2023-03-27', },
    [CHAIN.BASE]: { start: '2023-12-20', },
    [CHAIN.ETHEREUM]: { start: '2025-08-10', },
  },
  version: 2,
  doublecounted: true,
}

export default adapter;
