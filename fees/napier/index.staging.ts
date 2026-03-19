import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Napier Finance Fees Adapter - STAGING VERSION
 *
 * Points to api-staging.napier.finance for internal testing.
 * Staging API supports: Ethereum (1) and Arbitrum (42161) only.
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

const API_BASE_URL = "https://api-staging.napier.finance";

const fetch = (chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultFees> => {
    const { createBalances } = options;
    const url = `${API_BASE_URL}/v1/market?chainIds=${options.api.chainId!}`;

    let markets: Market[] = [];
    try {
      const res = await axios.get<Market[]>(url);
      markets = Array.isArray(res.data) ? res.data : [];
    } catch (e: any) {
      console.warn(`Failed to fetch markets for chain ${options.api.chainId}: ${e.message}`);
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

    const rewardTokens = [...new Set(
      markets.flatMap((m) =>
        (m.metrics?.underlyingRewards ?? []).map((r: any) => r.rewardToken.address)
      )
    )];
    const dailyRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens,
    });

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
  Fees: "[STAGING] Total fees including AMM trading fees, rehypothecation yield, and PT/YT fees (issuance, redemption, performance).",
  Revenue: "Revenue from LP-Curator and Curator-Protocol/DAO fee distribution ratios, plus treasury reward tokens.",
  SupplySideRevenue: "Curator's share of fees based on the LP-Curator fee distribution ratio.",
};

const chainConfig: Record<Chain, { treasury: string; start: string }> = {
  [CHAIN.ETHEREUM]: { treasury: "0x655231493557bb07df178Bdc29a65435934937e3", start: "2024-02-28" },
  [CHAIN.ARBITRUM]: { treasury: "0x655231493557bb07df178Bdc29a65435934937e3", start: "2024-03-11" },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.entries(chainConfig).map(([chain, config]) => [
        chain,
        { fetch: fetch(chain as Chain), start: config.start },
      ])
    ),
  },
  methodology,
};

export default adapter;
