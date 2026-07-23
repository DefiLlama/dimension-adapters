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

const LABELS = {
  AGGREGATOR_FEES: "Aggregator Fees",
  PROTOCOL_FEES: "Aggregator Fees to Protocol",
  LP_FEES: "Aggregator Fees to Liquidity Providers",
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const dexRes = await fetchLunarAnalytics("dexs", options);
  const dex = dexRes.data ?? {};

  const dexVolume = parseLunarUsdWei(dex.dailySwapVolume ?? dex.dailyVolume);
  if (dexVolume > 0) dailyVolume.addUSDValue(dexVolume);

  const dexFees = parseLunarUsdWei(dex.dailyFees);
  const dexRevenue = parseLunarUsdWei(
    dex.dailyProtocolRevenue ?? dex.dailyRevenue,
  );
  const dexSupplySideRevenue = resolveLunarSupplySideRevenue(
    dex.dailySupplySideRevenue,
    dexFees,
    dexRevenue,
    `Lunar Finance dexs (${options.chain})`,
  );

  if (dexFees > 0) {
    dailyFees.addUSDValue(dexFees, LABELS.AGGREGATOR_FEES);
    dailyUserFees.addUSDValue(dexFees, LABELS.AGGREGATOR_FEES);
  }
  if (dexRevenue > 0) {
    dailyRevenue.addUSDValue(dexRevenue, LABELS.PROTOCOL_FEES);
    dailyProtocolRevenue.addUSDValue(dexRevenue, LABELS.PROTOCOL_FEES);
  }
  if (dexSupplySideRevenue > 0) {
    dailySupplySideRevenue.addUSDValue(dexSupplySideRevenue, LABELS.LP_FEES);
  }

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
    if (sweeperVolume > 0) {
      dailyVolume.addUSDValue(sweeperVolume);
    }

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

    if (sweeperFees > 0) {
      dailyFees.addUSDValue(sweeperFees, LABELS.AGGREGATOR_FEES);
      dailyUserFees.addUSDValue(sweeperFees, LABELS.AGGREGATOR_FEES);
    }
    if (sweeperRevenue > 0) {
      dailyRevenue.addUSDValue(sweeperRevenue, LABELS.PROTOCOL_FEES);
      dailyProtocolRevenue.addUSDValue(sweeperRevenue, LABELS.PROTOCOL_FEES);
    }
    if (sweeperSupplySide > 0) {
      dailySupplySideRevenue.addUSDValue(sweeperSupplySide, LABELS.LP_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyUserFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "USD value of tokens swapped through Lunar Finance on the source chain, including meta-aggregator routes (Jupiter, LiFi, 0x, Relay, Orca, etc.) plus Enso batch-sweeper swaps. Data from the Lunar analytics API, filtered per chain and time window.",
  Fees: "User-paid fees on underlying DEX protocols plus Lunar platform fees where applicable.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  SupplySideRevenue: "Fees paid to underlying DEX liquidity providers (total fees minus Lunar protocol revenue).",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.AGGREGATOR_FEES]:"Aggregator fees paid by users for the swaps.",
  },
  UserFees: {
    [LABELS.AGGREGATOR_FEES]:"Aggregator fees paid by users for the swaps.",
  },
  Revenue: {
    [LABELS.PROTOCOL_FEES]: "Part of the aggregator fees that is retained by the protocol.",
  },
  ProtocolRevenue: {
    [LABELS.PROTOCOL_FEES]: "Part of the aggregator fees that is retained by the protocol.",
  },
  SupplySideRevenue: {
    [LABELS.LP_FEES]: "Part of the aggregator fees that is paid to the liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: LUNAR_DEFAULT_START,
  chains: LUNAR_ADAPTER_CHAINS,
  methodology,
  breakdownMethodology,
};

export default adapter;
