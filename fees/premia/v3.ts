import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";


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
  timestamp: number,
  options: FetchOptions
): Promise<FetchResultFees> {
  const toBlock = await options.getToBlock()
  const fromBlock = await options.getFromBlock();
  const query = gql`
  {

      today:factories(first: 1, block:{number: ${toBlock}}) {
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
      yesterday:factories(first: 1, block:{number: ${fromBlock}}) {
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

  const totalFees = (toNumber(response.factories[0]?.feeRevenueUSD || '0'));
  const totalProtocolFees = (toNumber(response.factories[0]?.protocolFeeRevenueUSD || '0'));

  if (dailyFees < 0) {
    throw new Error("Daily fees cannot be negative");
  }

  return {
    timestamp: timestamp,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: ((dailyFees) * .5),
    dailyProtocolRevenue: (dailyProtocolFees * 0.1),
    dailyHoldersRevenue: (dailyProtocolFees * 0.4),
    // dailySupplySideRevenue: (dailyMakerRebates),
    totalFees,
    totalUserFees: totalFees,
    totalRevenue: (totalFees * .5),
    totalProtocolRevenue: (totalProtocolFees * 0.2),
    totalHoldersRevenue: (totalProtocolFees * 0.4),
    // totalSupplySideRevenue: (totalMakerRebates),
  };
}

export default getFeeRevenueData;
