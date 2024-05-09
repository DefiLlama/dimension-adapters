import { FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";


function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length < 2) return ["0", "0"];
  return array.slice(0, 2).map((obj) => obj[key]) as [string, string];
}

function toNumber(value: string): number {
  return Number(ethers.formatEther(value));
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1]);
}

interface IGraphResponse {
  today: {
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  };
  yesterday: {
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  };
  factories: Array<{
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  }>;
}

async function getFeeRevenueData(
  url: string,
  timestamp: number
): Promise<FetchResultFees & { totalDailyHoldersRevenue: string }> {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const dailyId = Math.floor(timestamp / 86400);
  const yesterdayId = Math.floor(fromTimestamp / 86400);
  const query = gql`
  {

      today:factoryDayData(id: ${dailyId}) {
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
      yesterday:factoryDayData(id: ${yesterdayId}) {
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
      factories{
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
  }
  `

  const response: IGraphResponse = (await request(url, query));

  const dailyFees = (toNumber(response.today?.feeRevenueUSD || '0') - toNumber(response.yesterday?.feeRevenueUSD || '0'));
  const dailyProtocolFees = (toNumber(response.today?.protocolFeeRevenueUSD || '0')  - toNumber(response.yesterday?.protocolFeeRevenueUSD || '0'));
  const dailyMakerRebates = dailyFees - dailyProtocolFees;
  // const dailyPremiums = toNumber(factoryDayData?.premiumsUSD || 0);
  // const dailyExercisePayouts = toNumber(factoryDayData?.exercisePayoutsUSD || 0);

  const totalFees = (toNumber(response.factories[0]?.feeRevenueUSD || '0'));
  const totalProtocolFees = (toNumber(response.factories[0]?.protocolFeeRevenueUSD || '0'));
  const totalMakerRebates = totalFees - totalProtocolFees;
  // const totalPremiums = toNumber(factories[0]?.premiumsUSD || '0');
  // const totalExercisePayouts = toNumber(factories[0]?.exercisePayoutsUSD || '0');

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: ((dailyFees) * .5).toString(),
    dailyProtocolRevenue: (dailyProtocolFees * 0.1).toString(),
    dailyHoldersRevenue: (dailyProtocolFees * 0.4).toString(),
    // dailySupplySideRevenue: (dailyMakerRebates).toString(),
    totalFees: totalFees.toString(),
    totalUserFees: totalFees.toString(),
    totalRevenue: (totalFees * .5).toString(),
    totalProtocolRevenue: (totalProtocolFees * 0.2).toString(),
    totalDailyHoldersRevenue: (totalProtocolFees * 0.4).toString(),
    // totalSupplySideRevenue: (totalMakerRebates).toString(),
  };
}

export default getFeeRevenueData;
