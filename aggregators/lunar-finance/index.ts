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
  LUNAR_CHAIN_ID,
  LUNAR_DEFAULT_START,
  parseLunarUsdWei,
} from "../../helpers/lunarFinance";
import {
  fetchSweeperOnChainVolume,
  LUNAR_SWEEPER_ROUTER,
} from "../../helpers/lunarSweeperOnChain";

const fetch = async (options: FetchOptions) => {
  const [dexRes, sweeperRes] = await Promise.all([
    fetchLunarAnalytics("dexs", options),
    fetchLunarAnalytics("sweeper", options).catch(() => ({ data: {} })),
  ]);

  const dexPayload = dexRes.data ?? {};
  const sweeperPayload = sweeperRes.data ?? {};

  const dexUsd = parseLunarUsdWei(
    dexPayload.dailySwapVolume ?? dexPayload.dailyVolume,
  );
  const sweeperApiUsd = parseLunarUsdWei(
    sweeperPayload.dailySwapVolume ?? sweeperPayload.dailyVolume,
  );
  const apiUsd = dexUsd + sweeperApiUsd;

  const dailyFees = parseLunarUsdWei(dexPayload.dailyFees);
  const dailyRevenue = parseLunarUsdWei(
    dexPayload.dailyProtocolRevenue ?? dexPayload.dailyRevenue,
  );

  const baseResult = {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
  };

  const dailyVolume = options.createBalances();
  const hasOnChainSweeper = !!LUNAR_SWEEPER_ROUTER[options.chain];

  if (hasOnChainSweeper) {
    // DEX volume from API only; sweeper volume comes from on-chain router balances
    if (dexUsd > 0) dailyVolume.addUSDValue(dexUsd);
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
      if (sweeperApiUsd > 0) dailyVolume.addUSDValue(sweeperApiUsd);
    }
  } else if (apiUsd > 0) {
    dailyVolume.addUSDValue(apiUsd);
  }

  return { ...baseResult, dailyVolume };
};

const methodology = {
  Volume:
    "USD value of tokens swapped through Lunar Finance, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) from the Lunar analytics API, plus batch sweeper volume from the sweeper analytics API (non-EVM chains) or on-chain LunarSweeperRouter leg amounts where deployed (BSC).",
  Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
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
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.keys(LUNAR_CHAIN_ID).map((chain) => [
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
