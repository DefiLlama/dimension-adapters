import { Balances } from "@defillama/sdk";
import { CarbonAnalyticsResponse } from "./types";
import { FetchOptions } from "../../adapters/types";

const filterDataByDate = (
  swapData: CarbonAnalyticsResponse,
  startTimestampS: number,
  endTimestampS: number
) => {
  const startTimestampMs = startTimestampS * 1000;
  const endTimestampMs = endTimestampS * 1000;

  return swapData.filter((swap) => {
    const swapTsMs = Date.parse(swap.timestamp);
    return swapTsMs >= startTimestampMs && swapTsMs <= endTimestampMs;
  });
};

export const getDimensionsSum = (
  swapData: CarbonAnalyticsResponse,
  startTimestamp: number,
  endTimestamp: number
) => {
  const dailyData = filterDataByDate(swapData, startTimestamp, endTimestamp);

  const { dailyVolume, dailyFees } = dailyData.reduce(
    (prev, curr) => {
      return {
        dailyVolume: prev.dailyVolume + curr.targetamount_usd,
        dailyFees: prev.dailyFees + curr.tradingfeeamount_usd,
      };
    },
    {
      dailyVolume: 0,
      dailyFees: 0,
    }
  );
  const { totalVolume, totalFees } = swapData.reduce(
    (prev, curr) => {
      return {
        totalVolume: prev.totalVolume + curr.targetamount_usd,
        totalFees: prev.totalFees + curr.tradingfeeamount_usd,
      };
    },
    {
      totalVolume: 0,
      totalFees: 0,
    }
  );
  return {
    dailyVolume,
    totalVolume,
    dailyFees,
    totalFees,
  };
};

export const getDimensionsSumByToken = (
  swapData: CarbonAnalyticsResponse,
  startTimestamp: number,
  endTimestamp: number,
  emptyData: {
    dailyVolume: Balances;
    dailyFees: Balances;
    totalVolume: Balances;
    totalFees: Balances;
  }
) => {
  const dailyData = filterDataByDate(swapData, startTimestamp, endTimestamp);
  const { dailyVolume, dailyFees, totalFees, totalVolume } = emptyData;

  swapData.forEach((swap) => {
    totalVolume.add(swap.targetaddress, swap.targetamount_real);
    totalFees.add(swap.feeaddress, swap.tradingfeeamount_real);
  });

  dailyData.forEach((swap) => {
    dailyVolume.add(swap.targetaddress, swap.targetamount_real);
    dailyFees.add(swap.feeaddress, swap.tradingfeeamount_real);
  });

  return {
    dailyVolume,
    dailyFees,
    totalVolume,
    totalFees,
  };
};

export const getEmptyData = (options: FetchOptions) => {
  return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    totalVolume: options.createBalances(),
    totalFees: options.createBalances(),
  };
};
