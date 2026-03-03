import * as sdk from "@defillama/sdk";
import { SimpleAdapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";
import { getTimestampAtStartOfNextDayUTC } from "../utils/date";

const v2Endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CqWfkgRsJRrQ5vWq9tkEr68F5nvbAg63ati5SVJQLjK8'),
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('3o6rxHKuXZdy8jFifV99gMUe8FaVUL8w8bDTNdc4zyYg'),
  [CHAIN.FANTOM]:
    sdk.graph.modifyEndpoint('5ahtXN7DVTwnPuDhWqgJWvEeAEP3JD7h2kD1Kpe67VuW'),
  [CHAIN.OPTIMISM]:
    sdk.graph.modifyEndpoint('8wMexS8BB1cXWYu2V8cPHURGXSRGDBhshnU9nTiSkXQ7'),
}

const v2StartTimes: { [chain: string]: number } = {
  [CHAIN.ETHEREUM]: 1656201600,
  [CHAIN.ARBITRUM]: 1656201600,
  [CHAIN.FANTOM]: 1656201600,
  [CHAIN.OPTIMISM]: 1659744000,
}

const ONE_DAY = 24 * 60 * 60;
const dailyFeesQuery = gql`
  query V2FeeRevenue($timestampFrom: Int!, $timestampTo: Int!) {
    _totalPremiumsDailies:totalPremiumsDailies(
      first: 1
      orderDirection: desc
      orderBy: timestamp
      where: {
        totalPremiumsInUsd_gt: 0
      }
    ) {
      totalPremiumsInUsd
    }
    _totalFeeRevenueDailies:totalFeeRevenueDailies(
      first: 1
      orderDirection: desc
      orderBy: timestamp
      where: {
        totalFeeRevenueInUsd_gt: 0
      }
    ) {
      totalFeeRevenueInUsd
    }
    totalPremiumsDailies(
      first: 1
      orderDirection: desc
      orderBy: timestamp
      where: {
        timestamp_gte: $timestampFrom
        timestamp_lte: $timestampTo
        totalPremiumsInUsd_gt:0
      }
    ) {
      id
      timestamp
      totalPremiumsInUsd
    }
    totalFeeRevenueDailies(
      first: 1
      orderDirection: desc
      orderBy: timestamp
      where: {
        timestamp_gte: $timestampFrom
        timestamp_lte: $timestampTo
        totalFeeRevenueInUsd_gt:0
      }
    ) {
      id
      timestamp
      totalFeeRevenueInUsd
    }
  }
`;

function toNumber(value: string): number {
  return Number(ethers.formatEther(value));
}

async function getV2Data(url: string, timestamp: number) {
  const _timestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const fromTimestamp = _timestamp - 60 * 60 * 24
  const toTimestamp = _timestamp
  const yesterday = await request(
    url,
    dailyFeesQuery,
    {
      timestampFrom: fromTimestamp - ONE_DAY,
      timestampTo: fromTimestamp
    }
  );

  const today = await request(
    url,
    dailyFeesQuery,
    {
      timestampFrom: toTimestamp - ONE_DAY,
      timestampTo: toTimestamp
    }
  );

  const isYesterdayEmpty = yesterday.totalFeeRevenueDailies.length === 0 && yesterday.totalPremiumsDailies.length === 0;
  const isTodayEmpty = today.totalFeeRevenueDailies.length === 0 && today.totalPremiumsDailies.length === 0;
  const dailyFees = !isYesterdayEmpty && !isTodayEmpty ? toNumber(today.totalFeeRevenueDailies[0].totalFeeRevenueInUsd) - toNumber(yesterday.totalFeeRevenueDailies[0].totalFeeRevenueInUsd) : 0;

  return {
    timestamp: timestamp,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: (dailyFees * 0.8),
    dailyProtocolRevenue: (dailyFees * 0.2),
    dailyHoldersRevenue: (dailyFees * 0.8),
  };
}

const adapter: SimpleAdapter = {
  methodology: {
    UserFees:
      "Traders pay taker fees on each trade up to 3% of the option premium.",
    ProtocolRevenue: "The protocol collects 20% of the taker fees.",
    SupplySideRevenue:
      "Liquidity providers earn revenue from market-making options.",
    HoldersRevenue: "vxPREMIA holders collect 80% of the taker fees.",
  },
  adapter: Object.keys(v2Endpoints).reduce((acc: any, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: number) => await getV2Data(v2Endpoints[chain], ts),
        start: v2StartTimes[chain],
      },
    }
  }, {}),
}

export default adapter
