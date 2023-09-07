import { FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { utils } from "ethers";

const dailyFeesQuery = gql`
  query V3FeeRevenue($timestamp: Int!) {
    factoryDayDatas(
      first: 2
      orderDirection: desc
      orderBy: periodStart
      where: { periodStart_lte: $timestamp }
    ) {
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
  const { factoryDayDatas } = await request(url, dailyFeesQuery, {
    timestamp,
  });

  const dailyFees = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "feeRevenueUSD")
  );
  const dailyProtocolFees = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "protocolFeeRevenueUSD")
  );
  const dailyMakerRebates = dailyFees - dailyProtocolFees;
  const dailyPremiums = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "premiumsUSD")
  );
  const dailyExercisePayouts = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "exercisePayoutsUSD")
  );

  const totalFees = toNumber(factoryDayDatas[0].feeRevenueUSD);
  const totalProtocolFees = toNumber(factoryDayDatas[0].protocolFeeRevenueUSD);
  const totalMakerRebates = totalFees - totalProtocolFees;
  const totalPremiums = toNumber(factoryDayDatas[0].premiumsUSD);
  const totalExercisePayouts = toNumber(factoryDayDatas[0].exercisePayoutsUSD);

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: (dailyFees + dailyPremiums + dailyExercisePayouts).toString(),
    dailyProtocolRevenue: (dailyProtocolFees * 0.2).toString(),
    dailyHoldersRevenue: (dailyProtocolFees * 0.8).toString(),
    dailySupplySideRevenue: (dailyPremiums + dailyMakerRebates).toString(),
    totalFees: totalFees.toString(),
    totalUserFees: totalFees.toString(),
    totalRevenue: (totalFees + totalPremiums + totalExercisePayouts).toString(),
    totalProtocolRevenue: (totalProtocolFees * 0.2).toString(),
    totalDailyHoldersRevenue: (totalProtocolFees * 0.8).toString(),
    totalSupplySideRevenue: (totalPremiums + totalMakerRebates).toString(),
  };
}

export default getFeeRevenueData;
