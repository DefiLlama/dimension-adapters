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

  // Create balances object for all chains
  const dailyVolume = options.createBalances();
  if (apiUsd > 0) dailyVolume.addUSDValue(apiUsd);

  // BSC only: merge API USD with on-chain sweeper router token amounts
  if (LUNAR_SWEEPER_ROUTER[options.chain]) {
    try {
      const onChain = await fetchSweeperOnChainVolume(options);
      for (const [token, amount] of Object.entries(onChain.getBalances())) {
        if (token === "usd") continue;
        dailyVolume.add(token, amount);
      }
    } catch (err) {
      // Fallback: use API data only if on-chain fetch fails
      console.warn(
        `Failed to fetch on-chain sweeper data for ${options.chain}:`,
        err,
      );
    }
  }

  return { ...baseResult, dailyVolume };
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
      "USD value of tokens swapped through Lunar Finance, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) from the Lunar analytics API, plus batch sweeper volume from the s[...]",
    Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
    Revenue: "Protocol fees retained by Lunar Finance.",
    ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  },
};

export default adapter;
