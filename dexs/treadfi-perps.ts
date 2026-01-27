import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";
const EXTENDED_BUILDER_NAME = "Tread.fi";
const EXTENDED_API_URL = "https://api.starknet.extended.exchange/api/v1/info/builder/dashboard";

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
    dailyVolume.addCGToken("usd-coin", parseFloat(dayData.volume));
    dailyFees.addCGToken("usd-coin", parseFloat(dayData.extendedFees));
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
  },
  methodology,
  doublecounted: true,
};

export default adapter;
