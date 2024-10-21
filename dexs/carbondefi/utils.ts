import { FetchOptions } from "../../adapters/types";

export type CarbonAnalyticsItem = {
  timestamp: string;
  feesUsd: number;
  volumeUsd: number;
}

const filterDataByDate = (
  swapData: CarbonAnalyticsItem[],
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
  swapData: CarbonAnalyticsItem[],
  startTimestamp: number,
  endTimestamp: number
) => {
  const dailyData = filterDataByDate(swapData, startTimestamp, endTimestamp);

  const { dailyVolume, dailyFees } = dailyData.reduce(
    (prev, curr) => {
      return {
        dailyVolume: prev.dailyVolume + curr.volumeUsd,
        dailyFees: prev.dailyFees + curr.feesUsd,
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
        totalVolume: prev.totalVolume + curr.volumeUsd,
        totalFees: prev.totalFees + curr.feesUsd,
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

// const isNativeToken = (address: string) => address.toLowerCase() === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE".toLowerCase();

// export const getDimensionsSumByToken = (
//   swapData: CarbonAnalyticsItem[],
//   startTimestamp: number,
//   endTimestamp: number,
//   emptyData: {
//     dailyVolume: Balances;
//     dailyFees: Balances;
//     totalVolume: Balances;
//     totalFees: Balances;
//   },
// ) => {
//   const dailyData: CarbonAnalyticsItem[] = filterDataByDate(swapData, startTimestamp, endTimestamp);
//   const { dailyVolume, dailyFees, totalFees, totalVolume } = emptyData;

//   swapData.forEach((swap) => {
//     if (isNativeToken(swap.targetaddress)) {
//       totalVolume.addGasToken(swap.targetamount_real * 1e18);
//     } else {
//       totalVolume.add(swap.targetaddress, swap.targetamount_real);
//     }
//     if (isNativeToken(swap.feeaddress)) {
//       totalFees.addGasToken(swap.tradingfeeamount_real * 1e18);
//     } else {
//       totalFees.add(swap.feeaddress, swap.tradingfeeamount_real);
//     }
//   });

//   dailyData.forEach((swap) => {
//     if (isNativeToken(swap.targetaddress)) {
//       dailyVolume.addGasToken(swap.targetamount_real * 1e18);
//     } else {
//       dailyVolume.add(swap.targetaddress, swap.targetamount_real);
//     }
//     if (isNativeToken(swap.feeaddress)) {
//       dailyFees.addGasToken(swap.tradingfeeamount_real * 1e18);
//     } else {
//       dailyFees.add(swap.feeaddress, swap.tradingfeeamount_real);
//     }
//   });

//   return {
//     dailyVolume,
//     dailyFees,
//     totalVolume,
//     totalFees,
//   };
// };

export const getEmptyData = (options: FetchOptions) => {
  return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    totalVolume: options.createBalances(),
    totalFees: options.createBalances(),
  };
};
