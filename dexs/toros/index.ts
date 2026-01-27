import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import * as sdk from "@defillama/sdk";

const queryDeposits = `
      query deposits($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        deposits(
          where: { manager: $manager, time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { valueDeposited }
      }`

const queryWithdrawals = `
      query withdrawals($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        withdrawals(
          where: { managerName_in: ["Toros", "Torŏs"], time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { valueWithdrawn }
      }`

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

const fetchSubgraphData = async (chainId: CHAIN, query: string, dataField: string, startTimestamp: number, endTimestamp: number) => {
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

const calculateTotalVolume = (deposits: any, withdrawals: any): number =>
  deposits.reduce((acc: number, item: any) => {
    const depositValue = Number(item.valueDeposited) / 1e18;
    return acc + depositValue;
  }, 0) +
  withdrawals.reduce((acc: number, item: any) => {
    const withdrawalValue = Number(item.valueWithdrawn) / 1e18;
    return acc + withdrawalValue;
  }, 0);

const fetch = async ({ chain, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyDepositsEvents = await fetchSubgraphData(chain as CHAIN, queryDeposits, 'deposits', startTimestamp, endTimestamp);
  const dailyWithdrawalsEvents = await fetchSubgraphData(chain as CHAIN, queryWithdrawals, 'withdrawals', startTimestamp, endTimestamp);

  const dailyVolume = calculateTotalVolume(dailyDepositsEvents, dailyWithdrawalsEvents);

  return {
    dailyVolume: dailyVolume,
    timestamp: endTimestamp,
  };
}

const methodology = {
  DailyVolume: 'Sum of inflows and outflows that go through the Toros protocol'
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
  version: 2
}

export default adapter;
