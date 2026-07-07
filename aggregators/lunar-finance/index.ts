/**
 * Lunar Finance — DEX aggregator volume (+ sweeper)
 * Official Lunar Finance team · https://lunarfinance.io
 *
 * DATA SOURCE: Lunar analytics API (confirmed swap transactions).
 * The backend filters by source chain and time window, so each registered chain
 * reports its own per-chain volume/fees. Swap volume is split across two
 * endpoints that are NOT double-counted:
 *   - dexs    : regular meta-aggregator swaps (Jupiter, LiFi, 0x, Relay, etc.)
 *   - sweeper : Enso/batch-sweeper swaps
 * Total swap volume = dexs + sweeper.
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  fetchLunarAnalytics,
  LUNAR_ADAPTER_CHAINS,
  LUNAR_DEFAULT_START,
  parseLunarUsdWei,
  resolveLunarSupplySideRevenue,
} from "../../helpers/lunarFinance";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const dexRes = await fetchLunarAnalytics("dexs", options);
  const dex = dexRes.data ?? {};

  const dexVolume = parseLunarUsdWei(dex.dailySwapVolume ?? dex.dailyVolume);
  if (dexVolume > 0) dailyVolume.addUSDValue(dexVolume);

  let dailyFees = parseLunarUsdWei(dex.dailyFees);
  let dailyRevenue = parseLunarUsdWei(
    dex.dailyProtocolRevenue ?? dex.dailyRevenue,
  );
  let dailySupplySideRevenue = resolveLunarSupplySideRevenue(
    dex.dailySupplySideRevenue,
    dailyFees,
    dailyRevenue,
    `Lunar Finance dexs (${options.chain})`,
  );

  // Enso/batch-sweeper swaps are exposed on a separate, additive endpoint.
  // Only the fetch is best-effort: a network/endpoint failure should not drop
  // the regular swap volume. Parsing and fee/revenue reconciliation run outside
  // the catch so a genuine data-integrity mismatch (fees != revenue + supply
  // side) propagates instead of being masked as an "unavailable" endpoint.
  let sweeperRes;
  try {
    sweeperRes = await fetchLunarAnalytics("sweeper", options);
  } catch (err) {
    console.warn(
      `Lunar Finance sweeper analytics unavailable for ${options.chain}:`,
      err,
    );
  }

  if (sweeperRes) {
    const sweeper = sweeperRes.data ?? {};

    const sweeperVolume = parseLunarUsdWei(
      sweeper.dailySwapVolume ?? sweeper.dailyVolume,
    );
    if (sweeperVolume > 0) dailyVolume.addUSDValue(sweeperVolume);

    const sweeperFees = parseLunarUsdWei(sweeper.dailyFees);
    const sweeperRevenue = parseLunarUsdWei(
      sweeper.dailyProtocolRevenue ?? sweeper.dailyRevenue,
    );
    const sweeperSupplySide = resolveLunarSupplySideRevenue(
      sweeper.dailySupplySideRevenue,
      sweeperFees,
      sweeperRevenue,
      `Lunar Finance sweeper (${options.chain})`,
    );

    dailyFees += sweeperFees;
    dailyRevenue += sweeperRevenue;
    dailySupplySideRevenue += sweeperSupplySide;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "USD value of tokens swapped through Lunar Finance on the source chain, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) plus Enso batch-sweeper swaps. Data from the Lunar analytics API, filtered per chain and time window.",
  Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  SupplySideRevenue:
    "Fees paid to underlying DEX liquidity providers (total fees minus Lunar protocol revenue).",
};

const breakdownMethodology = {
  Volume: {
    "DEX aggregator volume":
      "Meta-aggregator swap volume from the Lunar analytics API (dexs endpoint), per chain.",
    "Sweeper volume":
      "Enso/batch-sweeper swap volume from the Lunar analytics API (sweeper endpoint), per chain.",
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
    "LP fees": "Fees paid to underlying DEX liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    LUNAR_ADAPTER_CHAINS.map((chain) => [
      chain,
      { fetch, start: LUNAR_DEFAULT_START },
    ]),
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
