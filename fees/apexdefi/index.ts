import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { burstMetrics } from "./burst";
import { swapMetrics } from "./dex";

const methodology = {
  Fees: "Swap fees paid by users of 0.03%",
  UserFees: "Swap fees paid by users of 0.03%",
  Revenue: "30% of collected swap fees",
  ProtocolRevenue: "30% of collected swap fees",
  SupplySideRevenue:
    "70% of collected swap fees are distributed to liquidity providers",
};

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyVolume = createBalances();
  const dailyRevenue = createBalances();

  const swapMetricsResult = await swapMetrics(options);

  dailyFees.addBalances(swapMetricsResult.dailyFees);

  dailyRevenue.addBalances(swapMetricsResult.dailyRevenue);

  dailySupplySideRevenue.addBalances(swapMetricsResult.dailySupplySideRevenue);

  dailyProtocolRevenue.addBalances(swapMetricsResult.dailyProtocolRevenue);

  dailyVolume.addBalances(swapMetricsResult.dailyVolume);

  // No burst metrics for Ethereum
  if (options.chain !== CHAIN.ETHEREUM) {
    const burstMetricsResult = await burstMetrics(options);

    dailyFees.addBalances(burstMetricsResult.dailyFees);
    dailyRevenue.addBalances(burstMetricsResult.dailyRevenue);
    dailyProtocolRevenue.addBalances(burstMetricsResult.dailyProtocolRevenue);
    dailyVolume.addBalances(burstMetricsResult.dailyVolume);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyVolume,
  };
};

const adapters: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2024-05-28',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2024-05-28',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-05-28',
    },
  },
  methodology,
};

export default adapters;
