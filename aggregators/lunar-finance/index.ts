/**
 * Lunar Finance — DEX aggregator volume (+ sweeper)
 * Official Lunar Finance team · https://lunarfinance.io
 *
 * DATA SOURCES (disclosed):
 * 1. Lunar analytics API — confirmed swap transactions (meta-aggregator routes)
 * 2. On-chain LunarSweeperRouter — batch sweeper legs where router is deployed
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  fetchLunarAnalytics,
  LUNAR_ADAPTER_CHAINS,
  LUNAR_DEFAULT_START,
  LUNAR_PRIMARY_CHAIN,
  parseLunarUsdWei,
  resolveLunarSupplySideRevenue,
} from "../../helpers/lunarFinance";
import {
  fetchSweeperOnChainVolume,
  LUNAR_SWEEPER_ROUTER,
} from "./sweeperOnChain";

const emptyFees = {
  dailyFees: 0,
  dailyRevenue: 0,
  dailyProtocolRevenue: 0,
  dailyUserFees: 0,
  dailySupplySideRevenue: 0,
};

function parseSweeperApiUsd(
  payload: Record<string, { usd?: string | number } | undefined>,
): number {
  return parseLunarUsdWei(payload.dailySwapVolume ?? payload.dailyVolume);
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const hasOnChainSweeper = !!LUNAR_SWEEPER_ROUTER[options.chain];
  const isPrimaryChain = options.chain === LUNAR_PRIMARY_CHAIN;

  if (!isPrimaryChain && !hasOnChainSweeper) {
    return { ...emptyFees, dailyVolume };
  }

  let dexUsd = 0;
  let sweeperApiUsd = 0;
  let baseResult = { ...emptyFees };

  if (isPrimaryChain) {
    const dexRes = await fetchLunarAnalytics("dexs", options);
    const dexPayload = dexRes.data ?? {};

    dexUsd = parseLunarUsdWei(
      dexPayload.dailySwapVolume ?? dexPayload.dailyVolume,
    );

    try {
      const sweeperRes = await fetchLunarAnalytics("sweeper", options);
      sweeperApiUsd = parseSweeperApiUsd(sweeperRes.data ?? {});
    } catch (err) {
      console.warn(
        `Lunar Finance sweeper API unavailable for ${options.chain}:`,
        err,
      );
    }

    const dailyFees = parseLunarUsdWei(dexPayload.dailyFees);
    const dailyRevenue = parseLunarUsdWei(
      dexPayload.dailyProtocolRevenue ?? dexPayload.dailyRevenue,
    );
    const dailySupplySideRevenue = resolveLunarSupplySideRevenue(
      dexPayload.dailySupplySideRevenue,
      dailyFees,
      dailyRevenue,
      `Lunar Finance dexs (${options.chain})`,
    );

    baseResult = {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue,
    };
  }

  if (hasOnChainSweeper) {
    try {
      const onChain = await fetchSweeperOnChainVolume(options);
      for (const [token, amount] of Object.entries(onChain.getBalances())) {
        if (token === "usd") continue;
        dailyVolume.add(token, amount);
      }
    } catch (err) {
      console.warn(
        `Failed to fetch on-chain sweeper data for ${options.chain}:`,
        err,
      );
      try {
        const sweeperRes = await fetchLunarAnalytics("sweeper", options);
        const fallbackUsd = parseSweeperApiUsd(sweeperRes.data ?? {});
        if (fallbackUsd > 0) dailyVolume.addUSDValue(fallbackUsd);
      } catch (apiErr) {
        console.warn(
          `Lunar Finance sweeper API fallback failed for ${options.chain}:`,
          apiErr,
        );
      }
    }
  } else if (isPrimaryChain) {
    // Sweeper API is non-EVM; EVM sweeper volume is tracked on-chain per router chain.
    const apiUsd = dexUsd + sweeperApiUsd;
    if (apiUsd > 0) dailyVolume.addUSDValue(apiUsd);
  }

  return { ...baseResult, dailyVolume };
};

const methodology = {
  Volume:
    "USD value of tokens swapped through Lunar Finance, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) from the Lunar analytics API, plus batch sweeper volume from the sweeper analytics API (non-EVM chains) or on-chain LunarSweeperRouter leg amounts where deployed (BSC). Protocol-wide API totals are attributed to Ethereum until the analytics API exposes per-chain breakdown.",
  Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  SupplySideRevenue:
    "Fees paid to underlying DEX liquidity providers (total fees minus Lunar protocol revenue).",
};

const breakdownMethodology = {
  Volume: {
    "DEX aggregator volume":
      "Meta-aggregator swap volume from the Lunar analytics API (dexs endpoint).",
    "Sweeper volume (API)":
      "Batch sweeper volume from the Lunar analytics API (sweeper endpoint) on chains without an on-chain router.",
    "Sweeper volume (on-chain)":
      "Token input amounts from LunarSweeperRouter sweep transactions where the router is deployed.",
  },
  Fees: {
    "User fees":
      "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
  },
  Revenue: {
    "Protocol fees": "Protocol fees retained by Lunar Finance.",
  },
  ProtocolRevenue: {
    "Treasury fees": "Fees collected by the Lunar Finance treasury.",
  },
  SupplySideRevenue: {
    "LP fees":
      "Fees paid to underlying DEX liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    LUNAR_ADAPTER_CHAINS.map((chain) => [
      chain,
      {
        fetch,
        start:
          LUNAR_SWEEPER_ROUTER[chain]?.start ?? LUNAR_DEFAULT_START,
      },
    ]),
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
