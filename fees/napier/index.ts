import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * Napier Finance Fees Adapter
 *
 * Napier is a fixed-rate yield protocol that allows users to trade principal tokens (PT)
 * and yield tokens (YT). Fees are collected from various activities and split between
 * curators and protocol.
 *
 * Data source: napier-api (pre-computed from subgraph data with DeFiLlama historical pricing)
 * Methodology:
 * - Reads daily fee data from napier-api /v1/market/daily-fees endpoint (1 API call per chain)
 * - The API accepts a timestamp and returns fees for the UTC day containing that timestamp
 * - Fees include: issuance, performance, redemption, post-settlement, and AMM swap fees
 * - Splits between curator (supply side) and protocol based on splitFeePercentage
 * - Fee events are sporadic (fire on yield collection, not daily) — $0 on quiet days is expected
 */

interface DailyFeeEntry {
  chainId: number;
  address: string;
  dailyFeeInUsd: number;
  dailyCuratorFeeInUsd: number;
  dailyProtocolFeeInUsd: number;
}

const API_BASE_URL = process.env.NAPIER_API_URL ?? 'https://api-v2.napier.finance';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { createBalances, chain, api } = options;
  const timestamp = options.toTimestamp;
  const url = `${API_BASE_URL}/v1/market/daily-fees?chainIds=${api.chainId!}&timestamp=${timestamp}`;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const entries = await fetchURL(url);
  if (!entries || !Array.isArray(entries)) {
    throw new Error(`Napier API returned invalid response for ${chain}`);
  }

  for (const entry of entries) {
    if (entry.dailyFeeInUsd > 0) {
      dailyFees.addUSDValue(entry.dailyFeeInUsd, "Yield & swap fees");
      dailySupplySideRevenue.addUSDValue(entry.dailyCuratorFeeInUsd, "Yield & swap fees to curators");
      dailyRevenue.addUSDValue(entry.dailyProtocolFeeInUsd, "Protocol/DAO share of yield & swap fees");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total fees including AMM trading fees (from Napier AMM/TokiHook swaps) and PT/YT fees (issuance, redemption, performance). Fee events fire on yield collection, not daily.",
  Revenue: "Protocol/DAO share of fees based on the Curator-Protocol fee distribution ratio, defined by Napier governance.",
  ProtocolRevenue: "Protocol/DAO share of curator fees based on the Curator-Protocol fee distribution ratio.",
  SupplySideRevenue: "Curator's share of fees based on the LP-Curator fee distribution ratio.",
};

const breakdownMethodology = {
  Fees: {
    "Yield & swap fees": "Daily fees from PT/YT operations (issuance, redemption, performance) and AMM swap fees, priced using DeFiLlama historical prices.",
  },
  Revenue: {
    "Protocol/DAO share of yield & swap fees": "Protocol/DAO share of yield and swap fees based on the fee distribution ratio.",
  },
  SupplySideRevenue: {
    "Yield & swap fees to curators": "Curator's share of yield and swap fees.",
  },
};

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2025-02-28" },
  [CHAIN.BASE]: { start: "2025-02-28" },
  [CHAIN.SONIC]: { start: "2025-03-10" },
  [CHAIN.ARBITRUM]: { start: "2025-03-28" },
  [CHAIN.OPTIMISM]: { start: "2025-03-11" },
  [CHAIN.FRAXTAL]: { start: "2025-03-29" },
  [CHAIN.MANTLE]: { start: "2025-03-11" },
  [CHAIN.BSC]: { start: "2025-03-12" },
  [CHAIN.POLYGON]: { start: "2025-03-27" },
  [CHAIN.AVAX]: { start: "2025-03-12" },
  [CHAIN.HYPERLIQUID]: { start: "2025-05-23" },
  [CHAIN.PLUME]: { start: "2025-05-28" },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
