import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";
const EXTENDED_BUILDER_NAMES = ["Tread.fi"];
// 2bps builder fee on Tread-routed Extended volume
// https://docs.tread.fi/account-creation-and-api-key-connection/connecting-to-exchanges/extended
const EXTENDED_BUILDER_FEE_RATE = 0.0002;
const TREADTOOLS_API_URL = "https://treadtools.vercel.app/api/defillama-volume";

interface TreadToolsApiResponse {
  status: string;
  data: {
    [exchange: string]: {
      dailyVolume: number;
      totalVolume: number;
    };
  };
  excludedVolume?: {
    dailyVolume: number;
    totalVolume: number;
  };
  timestamp: string;
  queriedDate: string | null;
  dateRange: {
    start: string;
    end: string;
  };
}

const VOLUME_LABEL = "Tread.fi OMS Fills";
const FEES_LABEL = "Builder Code Fees";
const REVENUE_LABEL = "Builder Code Fees To Tread.fi";

const getHeaders = () => {
  const apiKey = getEnv("TREADTOOLS_API_KEY");
  if (!apiKey) {
    throw new Error("TREADTOOLS_API_KEY is required but not configured");
  }
  return {
    "Authorization": `Bearer ${apiKey}`,
  };
};

const prefetch = async (options: FetchOptions): Promise<any> => {
  const url = `${TREADTOOLS_API_URL}?timestamp=${options.startOfDay}`;
  const response: TreadToolsApiResponse = await httpGet(url, {
    headers: getHeaders(),
    timeout: 30_000,
  });

  if (response.status !== "ok") {
    throw new Error(`TreadTools API returned status: ${response.status}`);
  }
  // The server clamps incomplete/future days to the last complete day; reject a
  // substituted date instead of recording it under the requested day.
  if (response.queriedDate !== options.dateString) {
    throw new Error(`TreadTools returned data for ${response.queriedDate}, expected ${options.dateString}`);
  }
  // Fills from venues missing in the server's bucket map are dropped from `data`;
  // fail loudly when the leak is material instead of silently underreporting.
  const excluded = Number(response.excludedVolume?.dailyVolume) || 0;
  const reported = Object.values(response.data).reduce((sum, d) => sum + (Number(d.dailyVolume) || 0), 0);
  if (excluded > 0.05 * (reported + excluded)) {
    throw new Error(`TreadTools excluded volume ${excluded} exceeds 5% of total ${reported + excluded}`);
  }
  return response;
};

// Volume from the TreadTools API (Tread.fi OMS fills), no builder fees on these venues.
// Accepts multiple keys for chains that aggregate several venues.
const volumeOnly = (...keys: string[]) => async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const data = options.preFetchedResults?.data;

  let totalVolume = 0;
  for (const key of keys) {
    const volume = data?.[key]?.dailyVolume;
    if (typeof volume === "number" && volume > 0) {
      totalVolume += volume;
    }
  }

  if (totalVolume > 0) {
    dailyVolume.addCGToken("usd-coin", totalVolume, VOLUME_LABEL);
  }

  return {
    dailyVolume,
    dailyFees: 0,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const fetchHyperliquid = async (options: FetchOptions) => {
  // Volume from TreadTools (Tread.fi OMS fills)
  const dailyVolume = options.createBalances();
  const treadToolsData = options.preFetchedResults;
  const hlData = treadToolsData?.data?.hyperliquid;
  if (hlData && typeof hlData.dailyVolume === "number" && hlData.dailyVolume > 0) {
    dailyVolume.addCGToken("usd-coin", hlData.dailyVolume, VOLUME_LABEL);
  }

  // Fees from builder API (actual builder fee revenue), rewrapped to carry breakdown labels
  const builder = await fetchBuilderCodeRevenue({
    options,
    builder_address: HL_BUILDER_ADDRESS,
  });
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  dailyFees.addBalances(builder.dailyFees, FEES_LABEL);
  dailyRevenue.addBalances(builder.dailyRevenue, REVENUE_LABEL);
  dailyProtocolRevenue.addBalances(builder.dailyProtocolRevenue, REVENUE_LABEL);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const fetchExtended = async (options: FetchOptions) => {
  // Volume from TreadTools (Tread.fi OMS fills)
  const dailyVolume = options.createBalances();
  const treadToolsData = options.preFetchedResults;
  const extendedData = treadToolsData?.data?.extended;
  if (extendedData && typeof extendedData.dailyVolume === "number" && extendedData.dailyVolume > 0) {
    dailyVolume.addCGToken("usd-coin", extendedData.dailyVolume, VOLUME_LABEL);
  }

  // Builder fees: 2bps of Tread-routed volume from the Extended builder dashboard
  const { dailyFees: builderFees } = await fetchBuilderData({
    options,
    builderNames: EXTENDED_BUILDER_NAMES,
    builderFeeRate: EXTENDED_BUILDER_FEE_RATE,
  });
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  dailyFees.addBalances(builderFees, FEES_LABEL);
  dailyRevenue.addBalances(builderFees, REVENUE_LABEL);
  dailyProtocolRevenue.addBalances(builderFees, REVENUE_LABEL);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume: "Notional volume of all orders executed through Tread.fi's OMS across connected venues, self-reported from Tread.fi's own fill records; includes both maker and taker executions. Flow routed to centralized exchanges (Bybit, Binance) is reported off-chain.",
  Fees: "Builder fees paid by Tread.fi users on venues where Tread attaches a builder code (Hyperliquid builder rewards, Extended at 2bps of routed volume).",
  Revenue: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
  ProtocolRevenue: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
};

const breakdownMethodology = {
  Volume: {
    [VOLUME_LABEL]: "Notional volume of all orders executed through Tread.fi's OMS across connected venues, self-reported from Tread.fi's own fill records; includes both maker and taker executions.",
  },
  Fees: {
    [FEES_LABEL]: "Builder fees paid by Tread.fi users on venues where Tread attaches a builder code (Hyperliquid, Extended).",
  },
  Revenue: {
    [REVENUE_LABEL]: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
  },
  ProtocolRevenue: {
    [REVENUE_LABEL]: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-10-05",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2025-12-28",
    },
    [CHAIN.PARADEX]: {
      fetch: volumeOnly("paradex"),
      start: "2025-11-11",
    },
    // Nado is a perps exchange on the Ink chain
    [CHAIN.INK]: {
      fetch: volumeOnly("nado"),
      start: "2026-01-07",
    },
    // Pacifica is a perps exchange on Solana
    [CHAIN.SOLANA]: {
      fetch: volumeOnly("pacifica"),
      start: "2025-10-30",
    },
    // Aster is a perps exchange on BSC
    [CHAIN.BSC]: {
      fetch: volumeOnly("aster"),
      start: "2025-10-25",
    },
    // All Orderly-broker venues (merged server-side into one bucket)
    [CHAIN.ORDERLY]: {
      fetch: volumeOnly("orderly"),
      start: "2025-10-01",
    },
    [CHAIN.RISE]: {
      fetch: volumeOnly("risex"),
      start: "2026-04-01",
    },
    // Perpl is a perps exchange on Monad
    [CHAIN.MONAD]: {
      fetch: volumeOnly("perpl"),
      start: "2026-02-12",
    },
    // Ondo Global Markets (stock perps, like the native ondo-perps adapter) plus
    // CEX flow routed by Tread (Bybit, Binance) - executed on centralized books,
    // so booked off-chain rather than under an L1
    [CHAIN.OFF_CHAIN]: {
      fetch: volumeOnly("ondo", "bybit", "binance"),
      start: "2024-08-09",
    },
    // Arcus is a perps exchange on Robinhood Chain (matches the native arcus-perps adapter)
    [CHAIN.ROBINHOOD]: {
      fetch: volumeOnly("arcus"),
      start: "2026-07-01",
    },
  },
  methodology,
  breakdownMethodology,
  // Same fills are counted by the native venue adapters (hyperliquid, extended,
  // paradex, nado, pacifica, perpl, risex-perps, ondo-perps, arcus-perps, orderly)
  doublecounted: true,
};

export default adapter;
