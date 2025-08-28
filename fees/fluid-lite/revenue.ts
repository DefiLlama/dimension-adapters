import { FetchOptions } from "../../adapters/types";
import { iETHv2_VAULT, CONFIG_FLUID_LITE } from "./config";
import { BigNumber } from "bignumber.js";

export const getFluidLiteDailyRevenue = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const [currentRevenueValue, startRevenueValue] = await Promise.all([
    options.api.call({
      abi: CONFIG_FLUID_LITE.revenueAbi,
      target: iETHv2_VAULT,
    }),

    options.fromApi.call({
      abi: CONFIG_FLUID_LITE.revenueAbi,
      target: iETHv2_VAULT,
    }),
  ]);

  // Add revenue delta to daily revenue
  const revenueDelta = new BigNumber(currentRevenueValue).minus(
    new BigNumber(startRevenueValue)
  );
  dailyRevenue.add(
    CONFIG_FLUID_LITE.stETHAddress,
    revenueDelta.toFixed()
  );

  const collectRevenueLogs = await options.getLogs({
    target: iETHv2_VAULT,
    onlyArgs: true,
    eventAbi: CONFIG_FLUID_LITE.eventAbi,
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.api.block),
    skipCacheRead: true,
    skipIndexer: true,
    // More resource-intensive but prevents logs from being cached.
    // Currently, the adapter is updated every hour.
    // In case of an error within a given time range for some reasons, the next sequence
    // can likely fix the issue naturally if it retries fetching all the logs
  });

  // If no logs emitted in this timeframe, return daily fees
  if (!collectRevenueLogs?.length) return dailyRevenue;

  // If revenue is collected in this timeframe, add the collected amount to daily fees
  const collectedRevenueAmount: BigNumber = collectRevenueLogs.reduce(
    (acc, log) => acc.plus(new BigNumber(log[0])),
    new BigNumber(0)
  );

  dailyRevenue.add(
    CONFIG_FLUID_LITE.stETHAddress,
    collectedRevenueAmount.toFixed()
  );

  return dailyRevenue;
};
