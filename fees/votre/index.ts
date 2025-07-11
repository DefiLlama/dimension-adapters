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
  console.log({ query })
  console.log({ data: data.providerPositions.length });
  return data.providerPositions;
}

async function loans(startTime: number, endTime: number) {
  const query = gql`
    query getLoans($startTime: Int!, $endTime: Int!) {
      loans(first: 1000, where: { openedAt_gte: $startTime, openedAt_lt: $endTime}) {
        underlyingAmount
        loansNFT {
          underlying
        }
      }
    }
  `;
  const data = await request(BASE_MAINNET_SUBGRAPH_URL, query, {
    startTime,
    endTime
  });
  return data.loans;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const { fromTimestamp, toTimestamp } = options;
  console.log({ fromTimestamp, toTimestamp });
  const providerPositions = await revenue(fromTimestamp, toTimestamp);
  providerPositions.forEach((log: any) => {
    dailyFees.add(log.collarProviderNFT.cashAsset, log.protocolFeeAmount);
  });
  const loansData = await loans(fromTimestamp, toTimestamp);
  loansData.forEach((log: any) => {
    dailyVolume.add(log.loansNFT.underlying, log.underlyingAmount);
  });
  return { dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    base: {
      fetch,
      start: '2025-04-16'
    }
  }
};

export default adapter;