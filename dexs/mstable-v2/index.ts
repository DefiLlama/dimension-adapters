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
          where: { managerName_in: ["mStable"], time_gte: $startTimestamp, time_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: time, orderDirection: desc
        ) { valueWithdrawn }
      }`

const CONFIG = {
  [CHAIN.ETHEREUM]: {
    endpoint: sdk.graph.modifyEndpoint("HSPZATdnDvYRNPBJm7eSrzkTeRZqhqYvy7c3Ngm9GCTL"),
    mstableManagerAddress: "0x3dd46846eed8D147841AE162C8425c08BD8E1b41",
  },
};

const fetchSubgraphData = async (chainId: CHAIN, query: string, dataField: string, startTimestamp: number, endTimestamp: number) => {
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
  DailyVolume: 'Sum of inflows and outflows that go through the mStable protocol'
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-10-27', },
  },
  version: 2
}

export default adapter;
