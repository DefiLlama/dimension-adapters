import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

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
 * - Fees include: issuance, performance, redemption, post-settlement, and AMM swap fees
 * - Splits between curator (supply side) and protocol based on splitFeePercentage
 * - Tracks protocol reward tokens sent to treasury
 */

interface DailyFeeEntry {
  chainId: number;
  address: string;
  dailyFeeInUsd: number;
  dailyCuratorFeeInUsd: number;
  dailyProtocolFeeInUsd: number;
}

const API_BASE_URL = process.env.NAPIER_API_URL ?? 'https://api-v2.napier.finance';

const fetch = async (options: FetchOptions) => {
    const { createBalances, chain, api } = options;
    const timestamp = options.toTimestamp;
    const url = `${API_BASE_URL}/v1/market/daily-fees?chainIds=${api.chainId!}&timestamp=${timestamp}`;

    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();

    let entries: DailyFeeEntry[];
    try {
      const res = await axios.get<DailyFeeEntry[]>(url, { timeout: 30_000 });
      if (!Array.isArray(res.data)) {
        throw new Error(`Napier API returned non-array payload for chain ${chain}`);
      }
      entries = res.data;
    } catch (e: any) {
      // Non-array response = schema corruption → re-throw
      if (e?.message?.includes('non-array')) throw e;
      // HTTP/timeout errors → log and return zero so other chains continue
      console.error(`Napier API fetch failed for ${chain} (chainId ${api.chainId}): ${e?.message ?? e}`);
      return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
    }

    for (const entry of entries) {
      if (entry.dailyFeeInUsd > 0) {
        dailyFees.addUSDValue(entry.dailyFeeInUsd, "Yield & swap fees");
        dailySupplySideRevenue.addUSDValue(entry.dailyCuratorFeeInUsd, "Curator fees");
        dailyRevenue.addUSDValue(entry.dailyProtocolFeeInUsd, "Protocol fees");
      }
    }

    // Protocol revenue from reward tokens sent to treasury
    const dailyTreasuryRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
    });
    dailyFees.addBalances(dailyTreasuryRevenue, "Treasury reward tokens");
    dailyRevenue.addBalances(dailyTreasuryRevenue, "Treasury reward tokens");

    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: dailyRevenue,
    };
  };

const methodology = {
  UserFees: "Users pay fees on AMM swaps, PT/YT issuance, redemption, and performance (before/after maturity). Fee rates are defined per market by curators.",
  Fees: "Total fees including AMM trading fees (from Napier AMM/TokiHook swaps) and PT/YT fees (issuance, redemption, performance).",
  Revenue: "Revenue governed by two fee distribution ratios: LP-Curator ratio (applies to AMM trading fees, defined per market by curators) and Curator-Protocol/DAO ratio (defined by Napier governance). Plus reward tokens sent to treasury.",
  ProtocolRevenue: "Protocol/DAO share of curator fees based on the Curator-Protocol fee distribution ratio, plus protocol reward tokens.",
  SupplySideRevenue: "Curator's share of fees based on the LP-Curator fee distribution ratio.",
};

const breakdownMethodology = {
  Fees: {
    "Yield & swap fees": "Daily fees from PT/YT operations (issuance, redemption, performance) and AMM swap fees, priced using DeFiLlama historical prices.",
    "Treasury reward tokens": "Reward tokens received by the protocol treasury.",
  },
  Revenue: {
    "Protocol fees": "Protocol/DAO share of yield and swap fees.",
    "Treasury reward tokens": "Reward tokens received by the protocol treasury.",
  },
  SupplySideRevenue: {
    "Curator fees": "Curator's share of yield and swap fees.",
  },
};

type Config = {
  treasury: string;
  start: string;
};

const chainConfig: Record<Chain, Config> = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-28",
  },
  [CHAIN.BASE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-27",
  },
  [CHAIN.SONIC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-07",
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.FRAXTAL]: {
    treasury: "0x8C244F488A742365ECB5047E78c29Ac2221ac0bf",
    start: "2024-03-11",
  },
  [CHAIN.MANTLE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.BSC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.POLYGON]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.AVAX]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
  [CHAIN.PLUME]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
