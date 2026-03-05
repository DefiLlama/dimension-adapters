import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { fetchPolymarketBuilderVolume } from "../helpers/polymarket";
import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const FLOWBOT_API = "https://flowbot.pro/api/dashboard/volume";
const HL_BUILDER_ADDRESS = "0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36";
const EXTENDED_BUILDER_NAMES = ["FlowBot"];
const FLOWBOT_POLYMARKET_BUILDER_NAME = "FlowBot";
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
  try {
    return await httpGet(`${FLOWBOT_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`);
  } catch (e) {
    return { platforms: {}, total_volume: 0, total_trades: 0, total_active_users: 0 };
  }
};

const getPlatformData = (options: FetchOptions, platform: string): PlatformData | undefined => {
  const data = options.preFetchedResults as FlowbotResponse;
  return data?.platforms?.[platform];
};

const safeFetch = (fn: (options: FetchOptions) => Promise<any>, withFees = true) => {
  return async (_: any, __: any, options: FetchOptions) => {
    try {
      return await fn(options);
    } catch (e) {
      if (!withFees) return { dailyVolume: options.createBalances() };
      return {
        dailyVolume: options.createBalances(),
        dailyFees: options.createBalances(),
        dailyRevenue: options.createBalances(),
        dailyProtocolRevenue: options.createBalances(),
      };
    }
  };
};

const fetchHyperliquid = safeFetch(async (options) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
});

const fetchExtended = safeFetch(async (options) => {
  const { dailyVolume, dailyFees } =
    await fetchBuilderData({ options, builderNames: EXTENDED_BUILDER_NAMES, builderFeeRate: FLOWBOT_FEE_RATE });
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
});

const fetchPolymarket = safeFetch(async (options) => {
  return fetchPolymarketBuilderVolume({ options, builder: FLOWBOT_POLYMARKET_BUILDER_NAME });
}, false);

const fetchFlowbotPlatform = (platform: string, feeRate?: number) => {
  return async (_a: any, _b: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const item = getPlatformData(options, platform);
    if (item && item.volume > 0) {
      dailyVolume.addCGToken("usd-coin", item.volume);
    }
    if (!feeRate) return { dailyVolume };

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    if (item && item.volume > 0) {
      if (item.fees && item.fees > 0) {
        dailyFees.addCGToken("usd-coin", item.fees);
      }
      dailyRevenue.addCGToken("usd-coin", item.volume * feeRate);
    }
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
  };
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
      fetch: fetchFlowbotPlatform("pacifica", FLOWBOT_FEE_RATE),
      start: "2024-01-01",
    },
    [CHAIN.INK]: {
      fetch: fetchFlowbotPlatform("nado", NADO_FEE_RATE),
      start: "2024-01-01",
    },
    [CHAIN.PARADEX]: {
      fetch: fetchFlowbotPlatform("paradex"),
      start: "2024-01-01",
    },
    [CHAIN.ZK_LIGHTER]: {
      fetch: fetchFlowbotPlatform("lighter"),
      start: "2024-01-01",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
