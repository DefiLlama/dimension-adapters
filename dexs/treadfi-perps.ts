import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";
const EXTENDED_BUILDER_NAME = "Tread.fi";
const EXTENDED_API_URL = "https://api.starknet.extended.exchange/api/v1/info/builder/dashboard";
const TREADTOOLS_API_URL = "https://treadtools.vercel.app/api/defillama-volume";

// Fee rate for TreadTools venues (2 bps)
const TREADTOOLS_FEE_RATE = 0.0002;

interface ExtendedDailyData {
  date: string;
  builderName: string;
  volume: string;
  extendedFees: string;
  activeUsers: number;
}

interface ExtendedApiResponse {
  status: string;
  data: {
    total: any[];
    daily: ExtendedDailyData[];
  };
}

interface TreadToolsApiResponse {
  status: string;
  data: {
    [exchange: string]: {
      dailyVolume: number;
      totalVolume: number;
    };
  };
  timestamp: string;
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

// Cache TreadTools response to avoid multiple API calls per run
let treadToolsCache: { data: TreadToolsApiResponse | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};

const fetchTreadToolsData = async (): Promise<TreadToolsApiResponse> => {
  const now = Date.now();
  // Cache for 5 minutes
  if (treadToolsCache.data && now - treadToolsCache.timestamp < 5 * 60 * 1000) {
    return treadToolsCache.data;
  }

  try {
    const response: TreadToolsApiResponse = await httpGet(TREADTOOLS_API_URL, {
      headers: getHeaders(),
    });

    if (response.status !== "ok") {
      throw new Error(`API returned status: ${response.status}`);
    }

    treadToolsCache = { data: response, timestamp: now };
    return response;
  } catch (error: any) {
    throw new Error(`Failed to fetch TreadTools data: ${error.message}`);
  }
};

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const fetchExtended = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Convert startOfDay timestamp to YYYY-MM-DD format
  const date = new Date(options.startOfDay * 1000);
  const dateStr = date.toISOString().split("T")[0];

  const response: ExtendedApiResponse = await httpGet(EXTENDED_API_URL);

  // Find Tread.fi data for the requested date
  const dayData = response.data.daily.find(
    (entry) => entry.builderName === EXTENDED_BUILDER_NAME && entry.date === dateStr
  );

  if (dayData) {
    const volume = parseFloat(dayData.volume);
    const fees = volume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", volume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchParadex = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const treadToolsData = await fetchTreadToolsData();
  const paradexData = treadToolsData.data?.paradex;

  if (paradexData && typeof paradexData.dailyVolume === "number" && paradexData.dailyVolume > 0) {
    const volume = paradexData.dailyVolume;
    const fees = volume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", volume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// Nado is a perps exchange on the Ink chain
const fetchInk = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const treadToolsData = await fetchTreadToolsData();
  const nadoData = treadToolsData.data?.nado;

  if (nadoData && typeof nadoData.dailyVolume === "number" && nadoData.dailyVolume > 0) {
    const volume = nadoData.dailyVolume;
    const fees = volume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", volume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// Aggregates Pacifica + Bybit (both CEX copy-trading on Solana)
const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const treadToolsData = await fetchTreadToolsData();
  const pacificaData = treadToolsData.data?.pacifica;
  const bybitData = treadToolsData.data?.bybit;

  let totalVolume = 0;
  if (pacificaData && typeof pacificaData.dailyVolume === "number") {
    totalVolume += pacificaData.dailyVolume;
  }
  if (bybitData && typeof bybitData.dailyVolume === "number") {
    totalVolume += bybitData.dailyVolume;
  }

  if (totalVolume > 0) {
    const fees = totalVolume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", totalVolume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// Aggregates Aster + Binance (both CEX copy-trading on BSC)
const fetchBsc = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const treadToolsData = await fetchTreadToolsData();
  const asterData = treadToolsData.data?.aster;
  const binanceData = treadToolsData.data?.binance;

  let totalVolume = 0;
  if (asterData && typeof asterData.dailyVolume === "number") {
    totalVolume += asterData.dailyVolume;
  }
  if (binanceData && typeof binanceData.dailyVolume === "number") {
    totalVolume += binanceData.dailyVolume;
  }

  if (totalVolume > 0) {
    const fees = totalVolume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", totalVolume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in Tread.fi perps trading terminal.",
  Revenue: "Fees collected by Tread.fi as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by Tread.fi as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-08-01",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2025-12-28",
    },
    [CHAIN.PARADEX]: {
      fetch: fetchParadex,
      start: "2024-10-05",
    },
    [CHAIN.INK]: {
      fetch: fetchInk,
      start: "2024-10-05",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2024-10-05",
    },
    [CHAIN.BSC]: {
      fetch: fetchBsc,
      start: "2024-10-05",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
