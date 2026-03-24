import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { burstMetrics } from "./burst";
import { swapMetrics } from "./dex";

const methodology = {
  Fees: "DEX swap fees (0.3% per trade) and Burst bonding curve fees (1% per trade plus launch fees)",
  UserFees: "DEX swap fees (0.3% per trade) and Burst bonding curve fees (1% per trade plus launch fees)",
  Revenue: "Protocol fees from DEX trades (0.1% per trade) and Burst trades (0.75% per trade plus launch fees)",
  ProtocolRevenue: "Protocol fees from DEX trades (0.1% per trade) and Burst trades (0.75% per trade plus launch fees)",
  SupplySideRevenue:
    "LP fees from DEX trades (0.2% per trade) distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Fees paid to DEX liquidity providers, 0.2% of each trade volume",
    [METRIC.PROTOCOL_FEES]: "Protocol fees from DEX trades, 0.1% of each trade volume",
    "Burst swap fees": "Trading fees on Burst bonding curves, 0.25% of each trade volume",
    "Burst protocol fees": "Protocol fees from Burst bonding curve trades, 0.75% of each trade volume",
    "Launch fees": "Fees collected when a bonding curve completes and token launches",
    [METRIC.CREATOR_FEES]: "Rewards paid to token creators when bonding curves complete",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees from DEX trades, 0.1% of each trade volume",
    "Burst protocol fees": "Protocol fees from Burst bonding curve trades, 0.75% of each trade volume",
    "Launch fees": "Fees collected when a bonding curve completes and token launches",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees from DEX trades, 0.1% of each trade volume",
    "Burst protocol fees": "Protocol fees from Burst bonding curve trades, 0.75% of each trade volume",
    "Launch fees": "Fees collected when a bonding curve completes and token launches",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Fees paid to DEX liquidity providers, 0.2% of each trade volume",
  },
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
      fetch,
      start: '2024-05-28',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-05-28',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-05-28',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapters;
