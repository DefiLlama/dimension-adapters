import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";
const EXTENDED_BUILDER_NAMES = ["Tread.fi"];
const TREADTOOLS_API_URL = "https://treadtools.vercel.app/api/defillama-volume";

interface TreadToolsApiResponse {
  status: string;
  data: {
    [exchange: string]: {
      dailyVolume: number;
      totalVolume: number;
    };
  };
  timestamp: string;
  queriedDate: string | null;
  dateRange: {
    start: string;
    end: string;
  };
}

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
  try {
    const url = `${TREADTOOLS_API_URL}?timestamp=${options.startOfDay}`;
    const response: TreadToolsApiResponse = await httpGet(url, {
      headers: getHeaders(),
    });

    if (response.status !== "ok") {
      throw new Error(`API returned status: ${response.status}`);
    }
    return response;
  } catch (error: any) {
    throw new Error(`Failed to fetch TreadTools data: ${error.message}`);
  }
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
    dailyVolume.addCGToken("usd-coin", totalVolume);
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
    dailyVolume.addCGToken("usd-coin", hlData.dailyVolume);
  }

  // Fees from builder API (actual builder fee revenue)
  const { dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const fetchExtended = async (options: FetchOptions) => {
  // Volume from TreadTools (Tread.fi OMS fills)
  const dailyVolume = options.createBalances();
  const treadToolsData = options.preFetchedResults;
  const extendedData = treadToolsData?.data?.extended;
  if (extendedData && typeof extendedData.dailyVolume === "number" && extendedData.dailyVolume > 0) {
    dailyVolume.addCGToken("usd-coin", extendedData.dailyVolume);
  }

  // Fees from builder API (observed builder fee revenue)
  const { dailyFees } = await fetchBuilderData({ options, builderNames: EXTENDED_BUILDER_NAMES });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Builder fees paid by Tread.fi users on venues where Tread attaches a builder code (Hyperliquid, Extended).",
  Revenue: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
  ProtocolRevenue: "Builder fees collected by Tread.fi (Hyperliquid and Extended builder programs).",
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
    // Aggregates Pacifica + Bybit (both CEX copy-trading on Solana)
    [CHAIN.SOLANA]: {
      fetch: volumeOnly("pacifica", "bybit"),
      start: "2024-08-09",
    },
    // Aggregates Aster + Binance (both CEX copy-trading on BSC)
    [CHAIN.BSC]: {
      fetch: volumeOnly("aster", "binance"),
      start: "2024-08-09",
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
    // Ondo Global Markets (stock perps), reported off-chain like the native ondo-perps adapter
    [CHAIN.OFF_CHAIN]: {
      fetch: volumeOnly("ondo"),
      start: "2026-03-17",
    },
    // Arcus is a perps exchange on Robinhood Chain (matches the native arcus-perps adapter)
    [CHAIN.ROBINHOOD]: {
      fetch: volumeOnly("arcus"),
      start: "2026-07-01",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
