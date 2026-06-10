import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import * as sdk from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

const queryManagerFeeMinteds = `
      query managerFeeMinteds($excludedManagers: [Bytes!]!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { manager_not_in: $excludedManagers, blockTimestamp_gte: $startTimestamp, blockTimestamp_lt: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { managerFee, daoFee, tokenPriceAtFeeMint }
      }`
const queryEntryFeeMinteds = `
      query entryFeeMinteds($excludedManagers: [Bytes!]!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        entryFeeMinteds(
          where: { managerAddress_not_in: $excludedManagers, time_gte: $startTimestamp, time_lt: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { entryFeeAmount, tokenPrice }
      }`

const queryExitFeeMenteds = `
      query exitFeeMinteds($excludedManagers: [Bytes!]!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        exitFeeMinteds(
          where: { managerAddress_not_in: $excludedManagers, time_gte: $startTimestamp, time_lt: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { exitFeeAmount, tokenPrice }
      }`

// daoFee fetched from all managers (including toros/mstable) - goes to protocol treasury regardless of manager
const queryAllManagerFeeMinteds = `
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lt: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { daoFee, tokenPriceAtFeeMint }
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

// Managers tracked separately in toros/mstable-v2 adapters — excluded here to avoid double-counting fees
// Addresses sourced from fees/toros/index.ts (torosManagerAddress) and fees/mstable-v2/index.ts (mstableManagerAddress)
const EXCLUDED_MANAGERS: Partial<Record<CHAIN, string[]>> = {
  [CHAIN.OPTIMISM]: ["0x813123a13d01d3f07d434673fdc89cbba523f14d"], // Toros manager
  [CHAIN.POLYGON]:  ["0x090e7fbd87a673ee3d0b6ccacf0e1d94fb90da59"], // Toros manager
  [CHAIN.ARBITRUM]: ["0xfbd2b4216f422dc1eee1cff4fb64b726f099def5"], // Toros manager
  [CHAIN.BASE]:     ["0x5619ad05b0253a7e647bd2e4c01c7f40ceab0879"], // Toros manager
  [CHAIN.ETHEREUM]: [
    "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5", // Toros manager
    "0x3dd46846eed8d147841ae162c8425c08bd8e1b41", // mStable manager
  ],
};

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
  [CHAIN.HYPERLIQUID]: {
    endpoint: 'https://api.subgraph.ormilabs.com/api/public/a5914000-d7d2-47be-b0cb-6719f6678ff0/subgraphs/dhedge/v0.0.3/gn',
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, volumeField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = PROVIDER_CONFIG[chainId];
  const excludedManagers = EXCLUDED_MANAGERS[chainId] ?? [];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        excludedManagers,
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

const fetchAllManagerFeeMinteds = async (chainId: CHAIN, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = PROVIDER_CONFIG[chainId];

  let allData: any[] = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(queryAllManagerFeeMinteds, {
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        first: batchSize,
        skip
      });

      const entries = data['managerFeeMinteds'];
      if (entries.length === 0) break;
      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;
    } catch (e) {
      throw new Error(`Error fetching daoFee data for chain ${chainId}: ${e.message}`);
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

const fetch = async ({ chain, endTimestamp, startTimestamp, createBalances }: FetchOptions) => {
  const config = PROVIDER_CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyManagerFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryManagerFeeMinteds, 'managerFeeMinteds', startTimestamp, endTimestamp);
  const dailyEntryFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryEntryFeeMinteds, 'entryFeeMinteds', startTimestamp, endTimestamp);
  const dailyExitFeesEvents = await fetchHistoricalFees(chain as CHAIN, queryExitFeeMenteds, 'exitFeeMinteds', startTimestamp, endTimestamp);
  const allManagerFeesEvents = await fetchAllManagerFeeMinteds(chain as CHAIN, startTimestamp, endTimestamp);

  const dailyManagerFeesAmount = calculateManagerFees(dailyManagerFeesEvents);  // non-toros/mstable managerFee
  const dailyEntryFeesAmount = calculateEntryFees(dailyEntryFeesEvents);         // non-toros/mstable entryFee
  const dailyExitFeesAmount = calculateExitFees(dailyExitFeesEvents);            // non-toros/mstable exitFee
  const dailyDaoFeesAmount = calculateDaoFees(allManagerFeesEvents);             // daoFee from ALL vaults incl. toros/mstable

  // Fees = non-toros/mstable (managerFee + entry/exit) + all daoFee
  // Revenue = all daoFee (protocol treasury)
  const dailyFees = createBalances();
  dailyFees.addUSDValue(dailyManagerFeesAmount, METRIC.MANAGEMENT_FEES);
  dailyFees.addUSDValue(dailyDaoFeesAmount, METRIC.PROTOCOL_FEES);
  dailyFees.addUSDValue(Number(dailyEntryFeesAmount) + Number(dailyExitFeesAmount), METRIC.DEPOSIT_WITHDRAW_FEES);

  const dailyRevenue = createBalances();
  dailyRevenue.addUSDValue(dailyDaoFeesAmount, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: 'All fees generated from dHEDGE vaults.',
  Revenue: 'All revenue collected by the dHEDGE protocol from fees generated.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: 'Fees paid to vault managers for actively managing investment strategies, split between protocol and managers',
    [METRIC.PROTOCOL_FEES]: 'DAO fee charged by dHEDGE protocol across all vaults on the platform, including Toros and mStable vaults',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Entry and exit fees charged when users deposit into or withdraw from vaults',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol share of management fees retained by the dHEDGE DAO",
  },
};

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.OPTIMISM]: { start: '2021-12-02', },
    [CHAIN.POLYGON]: { start: '2021-07-29', },
    [CHAIN.ARBITRUM]: { start: '2023-03-27', },
    [CHAIN.BASE]: { start: '2023-12-20', },
    [CHAIN.ETHEREUM]: { start: '2025-08-10', },
    [CHAIN.HYPERLIQUID]: { start: '2026-04-20', },
  },
  version: 2
}

export default adapter;
