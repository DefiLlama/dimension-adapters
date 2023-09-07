import { FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { utils } from "ethers";

const dailyFeesQuery = gql`
  query V3FeeRevenue($id: Int!) {
    factoryDayData(id: $id) {
      premiumsUSD
      exercisePayoutsUSD
      feeRevenueUSD
      protocolFeeRevenueUSD
    }
  }
`;

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length < 2) return ["0", "0"];
  return array.slice(0, 2).map((obj) => obj[key]) as [string, string];
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
  const dailyId = Math.floor(timestamp / 86400);
  const query = gql`
  {
      factoryDayData(id: ${dailyId}) {
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

  const {factoryDayData, factories} = (await request(url, query));

  const dailyFees = toNumber(factoryDayData.feeRevenueUSD);
  const dailyProtocolFees = toNumber(factoryDayData.protocolFeeRevenueUSD);
  const dailyMakerRebates = dailyFees - dailyProtocolFees;
  const dailyPremiums = toNumber(factoryDayData.premiumsUSD);
  const dailyExercisePayouts = toNumber(factoryDayData.exercisePayoutsUSD);

  const totalFees = toNumber(factories[0]?.feeRevenueUSD || '0');
  const totalProtocolFees = toNumber(factories[0]?.protocolFeeRevenueUSD || '0');
  const totalMakerRebates = totalFees - totalProtocolFees;
  const totalPremiums = toNumber(factories[0]?.premiumsUSD || '0');
  const totalExercisePayouts = toNumber(factories[0]?.exercisePayoutsUSD || '0');

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: ((dailyFees) * .5).toString(),
    dailyProtocolRevenue: (dailyProtocolFees * 0.1).toString(),
    dailyHoldersRevenue: (dailyProtocolFees * 0.4).toString(),
    dailySupplySideRevenue: (dailyMakerRebates).toString(),
    totalFees: totalFees.toString(),
    totalUserFees: totalFees.toString(),
    totalRevenue: (totalFees * .5).toString(),
    totalProtocolRevenue: (totalProtocolFees * 0.2).toString(),
    totalDailyHoldersRevenue: (totalProtocolFees * 0.4).toString(),
    totalSupplySideRevenue: (totalMakerRebates).toString(),
  };
}

export default getFeeRevenueData;
