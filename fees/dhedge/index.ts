import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import * as sdk from "@defillama/sdk";

const queryManagerFeeMinteds = `
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { managerFee, daoFee, tokenPriceAtFeeMint }
      }`
const queryEntryFeeMinteds = `
      query entryFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        entryFeeMinteds(
          where: { time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { entryFeeAmount, tokenPrice }
      }`

const queryExitFeeMenteds = `
      query exitFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        exitFeeMinteds(
          where: { time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { exitFeeAmount, tokenPrice }
      }`

// if graph goes down, can be pulled via event logs, example:
// https://optimistic.etherscan.io/tx/0x265e1eeb9a2c68ef8f58fe5e1d7e3f1151dd5e6686d4147445bf1bd8895deb38#eventlog check topic: 0x755a8059d66d8d243bc9f6913f429a811f154599d0538bb0b6a2ac23f23d2ccd
/* const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const logs = await getLogs({
    eventAbi: 'event ManagerFeeMinted (address pool, address manager, uint256 available, uint256 daoFee, uint256 managerFee, uint256 tokenPriceAtLastFeeMint)',
  });
  logs.forEach(i => {
    dailyFees.addUSDValue(i.daoFee.toString() * i.tokenPriceAtLastFeeMint.toString() / 1e36)
  });

  return { dailyFees, dailyRevenue: dailyFees };
} */
const PROVIDER_CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: sdk.graph.modifyEndpoint("A5noWtBtNTZBeueunF94spSnfyL1GP7hsuRv3r6nVvyD"),
  },
  [CHAIN.POLYGON]: {
    endpoint: sdk.graph.modifyEndpoint("AutWgquMFvUVEKVuqE55GWxAHDvRF7ZYfRMU1Bcqo5DW"),
  },
  [CHAIN.ARBITRUM]: {
    endpoint: sdk.graph.modifyEndpoint("C4LBuTkbXYoy2vSPRA5crGdWR4CAo3W64Rf1Won3fZio"),
  },
  [CHAIN.BASE]: {
    endpoint: sdk.graph.modifyEndpoint("AN6TxZwi5JwpPgPKbU16E5jpK5YE6Efuq2iavqVaYQeF"),
  },
  [CHAIN.ETHEREUM]: {
    endpoint: sdk.graph.modifyEndpoint("HSPZATdnDvYRNPBJm7eSrzkTeRZqhqYvy7c3Ngm9GCTL"),
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

    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

const calculateManagerFees = (data: any): number =>
    data.reduce((acc: number, item: any) => {
      const managerFee = Number(item.managerFee);
      const tokenPrice = Number(item.tokenPriceAtFeeMint);
      const managerFeeFormatted = managerFee / 1e18;
      const tokenPriceFormatted = tokenPrice / 1e18;
      const result = managerFeeFormatted * tokenPriceFormatted;
      return acc + result;
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

const calculateDaoFees = (data: any): number =>
    data.reduce((acc: number, item: any) => {
      const daoFee = Number(item.daoFee);
      const tokenPrice = Number(item.tokenPriceAtFeeMint);
      const daoFeeFormatted = daoFee / 1e18;
      const tokenPriceFormatted = tokenPrice / 1e18;
      const result = daoFeeFormatted * tokenPriceFormatted;
      return acc + result;
    }, 0);

const fetch = async ({ chain, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = PROVIDER_CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyManagerFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryManagerFeeMinteds, 'managerFeeMinteds', startTimestamp, endTimestamp);
  const dailyEntryFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryEntryFeeMinteds, 'entryFeeMinteds', startTimestamp, endTimestamp);
  const dailyExitFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryExitFeeMenteds, 'exitFeeMinteds', startTimestamp, endTimestamp);

  const dailyManagerFees = calculateManagerFees(dailyManagerFeesEvents);
  const dailyEntryFees = calculateEntryFees(dailyEntryFeesEvents);
  const dailyExitFees = calculateExitFees(dailyExitFeesEvents);
  const dailyFees = dailyManagerFees + dailyEntryFees + dailyExitFees;

  const dailyDaoFees = calculateDaoFees(dailyManagerFeesEvents);

  return {
    dailyFees,
    dailyRevenue: dailyDaoFees,
    dailyProtocolRevenue: dailyDaoFees,
    timestamp: endTimestamp,
  };
}

const meta = {
  methodology: {
    Fees: 'All fees generated from dHEDGE vaults.',
    Revenue: 'All revenue collected by the dHEDGE protocol from fees generated.',
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: '2021-12-02', meta },
    [CHAIN.POLYGON]: { fetch, start: '2021-07-29', meta },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-03-27', meta },
    [CHAIN.BASE]: { fetch, start: '2023-12-20', meta },
    [CHAIN.ETHEREUM]: { fetch, start: '2025-08-10', meta, },
  },
  version: 2
}

export default adapter;
