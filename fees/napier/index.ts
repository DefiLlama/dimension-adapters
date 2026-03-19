import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Napier Finance Fees Adapter
 *
 * Napier is a fixed-rate yield protocol that allows users to trade principal tokens (PT)
 * and yield tokens (YT). Fees are collected from various activities and split between
 * curators and protocol.
 *
 * Data source: napier-api (pre-computed from subgraph data)
 * Methodology:
 * - Reads dailyFeeInUsd from napier-api market list (1 API call per chain)
 * - Fees include: issuance, performance, redemption, post-settlement, and swap fees
 * - Splits between curator (supply side) and protocol based on splitFeePercentage
 * - Tracks protocol reward tokens sent to treasury
 */

interface Market {
  metrics: {
    dailyFeeInUsd?: number;
    dailyCuratorFeeInUsd?: number;
    dailyProtocolFeeInUsd?: number;
    underlyingRewards: Array<{
      rewardToken: {
        address: string;
      };
    }>;
  };
}

const API_BASE_URL = process.env.NAPIER_API_URL ?? 'https://api-v2.napier.finance';

const fetch = (chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultFees> => {
    const { createBalances } = options;
    const url = `${API_BASE_URL}/v1/market?chainIds=${options.api.chainId!}`;

    let markets: Market[];
    try {
      const res = await axios.get<Market[]>(url);
      if (!Array.isArray(res.data)) {
        throw new Error(`Napier API returned non-array payload for chain ${chain} (chainId ${options.api.chainId})`);
      }
      markets = res.data;
    } catch (e: any) {
      throw new Error(`Napier API fetch failed for chain ${chain} (chainId ${options.api.chainId}): ${e?.message ?? e}`);
    }

    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();

    for (const market of markets) {
      const fee = Number(market.metrics?.dailyFeeInUsd ?? 0);
      const curatorFee = Number(market.metrics?.dailyCuratorFeeInUsd ?? 0);
      if (fee > 0) {
        dailyFees.addUSDValue(fee);
        dailySupplySideRevenue.addUSDValue(curatorFee);
      }
    }

    // Protocol revenue from reward tokens sent to treasury
    const rewardTokens = [...new Set(
      markets.flatMap((m) =>
        (m.metrics?.underlyingRewards ?? []).map((r: any) => r.rewardToken.address)
      )
    )];
    let dailyRevenue = createBalances();
    if (rewardTokens.length > 0) {
      dailyRevenue = await addTokensReceived({
        options,
        target: chainConfig[chain].treasury,
        tokens: rewardTokens,
      });
    }

    // Add protocol's share of fees (non-curator portion)
    for (const market of markets) {
      const protocolFee = Number(market.metrics?.dailyProtocolFeeInUsd ?? 0);
      if (protocolFee > 0) {
        dailyRevenue.addUSDValue(protocolFee);
      }
    }

    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      timestamp: options.startOfDay,
    };
  };
};

const methodology = {
  UserFees: "Users pay fees on AMM swaps, PT/YT issuance, redemption, and performance (before/after maturity). Fee rates are defined per market by curators.",
  Fees: "Total fees including AMM trading fees (from Napier AMM/TokiHook swaps) and PT/YT fees (issuance, redemption, performance).",
  Revenue: "Revenue governed by two fee distribution ratios: LP-Curator ratio (applies to AMM trading fees, defined per market by curators) and Curator-Protocol/DAO ratio (defined by Napier governance). Plus reward tokens sent to treasury.",
  ProtocolRevenue: "Protocol/DAO share of curator fees based on the Curator-Protocol fee distribution ratio, plus protocol reward tokens.",
  SupplySideRevenue: "Curator's share of fees based on the LP-Curator fee distribution ratio.",
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

type Config = {
  treasury: string;
  start: string;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.entries(chainConfig).map(([chain, config]) => [
        chain,
        {
          fetch: fetch(chain as Chain),
          start: config.start,
        },
      ])
    ),
  },
  methodology,
};

export default adapter;
