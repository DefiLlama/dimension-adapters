import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { fetchPolymarketBuilderVolume } from "../helpers/polymarket";
import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const FLOWBOT_API = "https://flowbot.pro/api/dashboard/volume";
const HL_BUILDER_ADDRESS = "0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36";
const EXTENDED_BUILDER_NAMES = ["FlowBot"];
const FLOWBOT_FEE_RATE = 0.0001;
const NADO_FEE_RATE = 0.00002;

interface PlatformData {
  volume: number;
  fees: number;
  total_trades: number;
  active_bots: number;
  active_users: number;
}

interface FlowbotResponse {
  platforms: { [platform: string]: PlatformData };
  total_volume: number;
  total_trades: number;
  total_active_users: number;
}

const prefetch = async (options: FetchOptions): Promise<any> => {
  return httpGet(`${FLOWBOT_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`);
};

const getPlatformData = (options: FetchOptions, platform: string): PlatformData | undefined => {
  const data = options.preFetchedResults as FlowbotResponse;
  return data?.platforms?.[platform];
};

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions) => {
  try {
    const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
      await fetchBuilderCodeRevenue({
        options,
        builder_address: HL_BUILDER_ADDRESS,
      });
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
  } catch (e) {
    return {
      dailyVolume: options.createBalances(),
      dailyFees: options.createBalances(),
      dailyRevenue: options.createBalances(),
      dailyProtocolRevenue: options.createBalances(),
    };
  }
};

const fetchExtended = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees } =
    await fetchBuilderData({
      options,
      builderNames: EXTENDED_BUILDER_NAMES,
      builderFeeRate: FLOWBOT_FEE_RATE,
    });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchPolymarket = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchPolymarketBuilderVolume({
    options,
    builder: "FlowBot",
  });
};

const fetchNado = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const item = getPlatformData(options, "nado");
  if (item && item.volume > 0) {
    dailyVolume.addCGToken("usd-coin", item.volume);
    if (item.fees && item.fees > 0) {
      dailyFees.addCGToken("usd-coin", item.fees);
    }
    dailyRevenue.addCGToken("usd-coin", item.volume * NADO_FEE_RATE);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const fetchPacifica = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const item = getPlatformData(options, "pacifica");
  if (item && item.volume > 0) {
    dailyVolume.addCGToken("usd-coin", item.volume);
    if (item.fees && item.fees > 0) {
      dailyFees.addCGToken("usd-coin", item.fees);
    }
    dailyRevenue.addCGToken("usd-coin", item.volume * FLOWBOT_FEE_RATE);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const fetchParadex = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const item = getPlatformData(options, "paradex");
  if (item && item.volume > 0) {
    dailyVolume.addCGToken("usd-coin", item.volume);
  }

  return { dailyVolume };
};

const fetchLighter = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const item = getPlatformData(options, "lighter");
  if (item && item.volume > 0) {
    dailyVolume.addCGToken("usd-coin", item.volume);
  }

  return { dailyVolume };
};

const methodology = {
  Fees: "Trading fees paid by users when trading through FlowBot.",
  Revenue: "FlowBot builder revenue: builder fees from Hyperliquid, 1 bps on Extended/Pacifica, 0.2 bps on Nado.",
  ProtocolRevenue: "FlowBot builder revenue: builder fees from Hyperliquid, 1 bps on Extended/Pacifica, 0.2 bps on Nado.",
};

const adapter: SimpleAdapter = {
  prefetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-11-27",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2026-01-26",
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolymarket,
      start: "2024-01-01",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchPacifica,
      start: "2024-01-01",
    },
    [CHAIN.INK]: {
      fetch: fetchNado,
      start: "2024-01-01",
    },
    [CHAIN.PARADEX]: {
      fetch: fetchParadex,
      start: "2024-01-01",
    },
    [CHAIN.ZK_LIGHTER]: {
      fetch: fetchLighter,
      start: "2024-01-01",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
