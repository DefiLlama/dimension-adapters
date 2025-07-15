import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { request, gql } from "graphql-request";

const BASE_MAINNET_SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm3exke617zqh01074tulgtx0/subgraphs/collar-base-mainnet/0.1.3/gn'


async function revenue(startTime: number, endTime: number) {
  const query = gql`
    query getProtocolFees($startTime: Int!, $endTime: Int!) {
      providerPositions(first: 1000, where: { createdAt_gte: $startTime, createdAt_lt: $endTime}) {
        protocolFeeAmount
          collarProviderNFT {
            cashAsset
          }
      }
    }
  `;
  const data = await request(BASE_MAINNET_SUBGRAPH_URL, query, {
    startTime,
    endTime
  });
  return data.providerPositions;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const { startTimestamp, endTimestamp } = options;

  const providerPositions = await revenue(startTimestamp, endTimestamp);
  providerPositions.forEach((log: any) => {
    dailyFees.add(log.collarProviderNFT.cashAsset, log.protocolFeeAmount);
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: '',
  Revenue: '',
  ProtocolRevenue: ''
} 

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    base: {
      fetch,
      start: '2025-04-16',
      meta: { methodology }
    }
  }
};

export default adapter;
