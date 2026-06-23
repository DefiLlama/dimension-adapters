/**
 * Lunar Finance — DEX aggregator volume (+ sweeper)
 * Official Lunar Finance team · https://lunarfinance.io
 *
 * Paste into: dimension-adapters/aggregators/lunar-finance/index.ts
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

  // BSC only: merge API USD with on-chain sweeper router token amounts
  if (LUNAR_SWEEPER_ROUTER[options.chain]) {
    const dailyVolume = options.createBalances();
    if (apiUsd > 0) dailyVolume.addUSDValue(apiUsd);

    const onChain = await fetchSweeperOnChainVolume(options);
    for (const [token, amount] of Object.entries(onChain.getBalances())) {
      if (token === "usd") continue;
      dailyVolume.add(token, amount);
    }

    return { ...baseResult, dailyVolume };
  }

  return { ...baseResult, dailyVolume: apiUsd };
};

const adapter: SimpleAdapter = {
  version: 2,
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
  methodology: {
    Volume:
      "USD value of tokens swapped through Lunar Finance, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) from the Lunar analytics API, plus batch sweeper volume from the sweeper analytics API and on-chain LunarSweeperRouter leg amounts where deployed.",
    Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
    Revenue: "Protocol fees retained by Lunar Finance.",
    ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  },
};

export default adapter;
