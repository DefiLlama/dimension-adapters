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

const isNativeToken = (address: string) =>
  address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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
    if (isNativeToken(swap.targetaddress)) {
      totalVolume.addGasToken(swap.targetamount_real);
    } else {
      totalVolume.add(swap.targetaddress, swap.targetamount_real);
    }
    if (isNativeToken(swap.feeaddress)) {
      totalFees.addGasToken(swap.tradingfeeamount_real);
    } else {
      totalFees.add(swap.feeaddress, swap.tradingfeeamount_real);
    }
  });

  dailyData.forEach((swap) => {
    if (isNativeToken(swap.targetaddress)) {
      dailyVolume.addGasToken(swap.targetamount_real);
    } else {
      dailyVolume.add(swap.targetaddress, swap.targetamount_real);
    }
    if (isNativeToken(swap.feeaddress)) {
      dailyFees.addGasToken(swap.tradingfeeamount_real);
    } else {
      dailyFees.add(swap.feeaddress, swap.tradingfeeamount_real);
    }
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
