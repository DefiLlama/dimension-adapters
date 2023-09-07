import { FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { utils } from "ethers";

const dailyFeesQuery = gql`
  query V2FeeRevenue($timestamp: String) {
    totalPremiumsDailies {
      totalPremiumsInUsd
    }
    totalFeeRevenues {
      totalFeeRevenueInUsd
    }
    totalPremiumsDailies(
      first: 3
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalPremiumsInUsd
    }
    totalFeeRevenueDailies(
      first: 3
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalFeeRevenueInUsd
    }
  }
`;

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length <= 2) return ["0", "0"];
  return array.slice(1, 3).map((obj) => obj[key]) as [string, string];
}

function toNumber(value: string): number {
  return Number(utils.formatEther(value));
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1]);
}

async function getFeeRevenueData(
  url: string,
  timestamp: number
): Promise<FetchResultFees & { totalDailyHoldersRevenue: string }> {
  const { totalPremiumsDailies, totalFeeRevenueDailies } = await request(
    url,
    dailyFeesQuery,
    {
      timestamp: timestamp.toString(),
    }
  );

  const dailyFees = calcLast24hrsVolume(
    get2Days(totalFeeRevenueDailies, "totalFeeRevenueInUsd")
  );
  const dailyPremiums = calcLast24hrsVolume(
    get2Days(totalPremiumsDailies, "totalPremiumsInUsd")
  );

  const totalFees = toNumber(totalFeeRevenueDailies[0].totalFeeRevenueInUsd);
  const totalPremiums = toNumber(totalPremiumsDailies[0].totalPremiumsInUsd);

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: (dailyFees + dailyPremiums).toString(),
    dailyProtocolRevenue: (dailyFees * 0.2).toString(),
    dailyHoldersRevenue: (dailyFees * 0.8).toString(),
    dailySupplySideRevenue: dailyPremiums.toString(),
    totalFees: totalFees.toString(),
    totalUserFees: totalFees.toString(),
    totalRevenue: (totalFees + totalPremiums).toString(),
    totalProtocolRevenue: (totalFees * 0.2).toString(),
    totalDailyHoldersRevenue: (totalFees * 0.8).toString(),
    totalSupplySideRevenue: totalPremiums.toString(),
  };
}

export default getFeeRevenueData;
