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
 * - AMM swap fees: TokiHook reserves part of each swap fee (reserveFeePct) for curator and
 *   protocol; the rest goes to LPs (supply side, dailyLpFeeInUsd). Curve pool fees go to LPs.
 * - PT/YT fees and the TokiHook reserve are split between curator (supply side) and protocol
 *   by the market's fee split ratio
 * - PT/YT fee events are sporadic (fire on yield collection, not daily) — $0 on quiet days is expected
 */

interface DailyFeeEntry {
  chainId: number;
  address: string;
  dailyFeeInUsd: number;
  dailyCuratorFeeInUsd: number;
  dailyProtocolFeeInUsd: number;
  dailyLpFeeInUsd?: number;
}

const API_BASE_URL = process.env.NAPIER_API_URL ?? 'https://api-v2.napier.finance';

const fetch = async (options: FetchOptions) => {
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
      dailySupplySideRevenue.addUSDValue(entry.dailyLpFeeInUsd ?? 0, "Swap fees to LPs");
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
  Fees: "Total fees paid by users: AMM swap fees (Napier Curve pools and TokiHook pools, the whole swap fee including the part reserved for curators and protocol) and PT/YT fees (issuance, redemption, performance). PT/YT fee events fire on yield collection, not daily.",
  Revenue: "Protocol/DAO share of PT/YT fees and of the TokiHook swap fee reserve, based on the Curator-Protocol fee split ratio.",
  ProtocolRevenue: "Protocol/DAO share of PT/YT fees and of the TokiHook swap fee reserve, based on the Curator-Protocol fee split ratio.",
  SupplySideRevenue: "Swap fees paid to AMM LPs, plus the curator's share of PT/YT fees and of the TokiHook swap fee reserve.",
};

const breakdownMethodology = {
  Fees: {
    "Yield & swap fees": "Daily fees from PT/YT operations (issuance, redemption, performance) and the whole AMM swap fee, priced using DeFiLlama historical prices.",
  },
  Revenue: {
    "Protocol/DAO share of yield & swap fees": "Protocol/DAO share of PT/YT fees and of the TokiHook swap fee reserve, based on the fee split ratio.",
  },
  SupplySideRevenue: {
    "Yield & swap fees to curators": "Curator's share of PT/YT fees and of the TokiHook swap fee reserve.",
    "Swap fees to LPs": "LP share of AMM swap fees: on TokiHook pools the part not reserved for curators and protocol; on Curve pools the whole pool fee, which includes Curve's own admin fee.",
  },
};

const chainConfig: Record<string, { start: string, deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { start: "2025-02-28" },
  [CHAIN.BASE]: { start: "2025-02-28" },
  [CHAIN.SONIC]: { start: "2025-03-10", deadFrom: "2026-09-28" },
  [CHAIN.ARBITRUM]: { start: "2025-03-28" },
  [CHAIN.OPTIMISM]: { start: "2025-03-11", deadFrom: "2026-09-28" },
  [CHAIN.FRAXTAL]: { start: "2025-03-29", deadFrom: "2026-10-24" },
  [CHAIN.MANTLE]: { start: "2025-03-11", deadFrom: "2026-09-28" },
  [CHAIN.BSC]: { start: "2025-03-12" },
  [CHAIN.POLYGON]: { start: "2025-03-27", deadFrom: "2026-09-28" },
  [CHAIN.AVAX]: { start: "2025-03-12", deadFrom: "2026-09-28" },
  [CHAIN.HYPERLIQUID]: { start: "2025-05-23", deadFrom: "2026-10-24" },
  [CHAIN.PLUME]: { start: "2025-05-28", deadFrom: "2026-10-24" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-15" },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
