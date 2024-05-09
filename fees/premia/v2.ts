import { FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

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

async function getFeeRevenueData(
  url: string,
  timestamp: number
): Promise<FetchResultFees & { totalDailyHoldersRevenue: string }> {
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
  // const dailyPremiums = !isYesterdayEmpty && !isTodayEmpty ? toNumber(today.totalPremiumsDailies[0].totalPremiumsInUsd) - toNumber(yesterday.totalPremiumsDailies[0].totalPremiumsInUsd) : 0;


  const totalFees = toNumber(today._totalFeeRevenueDailies[0].totalFeeRevenueInUsd);
  // const totalPremiums = toNumber(today._totalPremiumsDailies[0].totalPremiumsInUsd);

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: (dailyFees * 0.8).toString(),
    dailyProtocolRevenue: (dailyFees * 0.2).toString(),
    dailyHoldersRevenue: (dailyFees * 0.8).toString(),
    // dailySupplySideRevenue: dailyPremiums.toString(),
    totalFees: totalFees.toString(),
    totalUserFees: totalFees.toString(),
    totalRevenue: (totalFees * 0.8).toString(),
    totalProtocolRevenue: (totalFees * 0.2).toString(),
    totalDailyHoldersRevenue: (totalFees * 0.8).toString(),
    // totalSupplySideRevenue: totalPremiums.toString(),
  };
}

export default getFeeRevenueData;
