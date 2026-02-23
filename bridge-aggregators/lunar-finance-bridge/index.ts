import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LUNA_API_BASE = "https://api.lunarfinance.io";
const BRIDGE_ANALYTICS_ENDPOINT = `${LUNA_API_BASE}/api/analytics/bridge`;

interface LunaAnalyticsResponse {
  success: boolean;
  data: {
    dailyBridgeVolume?: {
      usd: string;
    };
    dailyFees?: {
      usd: string;
    };
    dailyRevenue?: {
      usd: string;
    };
  };
}

const fetch = async (options: FetchOptions) => {
  const url = `${BRIDGE_ANALYTICS_ENDPOINT}?startTime=${options.startTimestamp + 1}&endTime=${options.endTimestamp}`;
  const data: LunaAnalyticsResponse = await fetchURL(url);

  const { dailyBridgeVolume, dailyFees, dailyRevenue } = data.data;

  return {
    dailyBridgeVolume: Number(dailyBridgeVolume?.usd) / 1e18 || 0,
    dailyFees: Number(dailyFees?.usd) / 1e18 || 0,
    dailyRevenue: Number(dailyRevenue?.usd) / 1e18 || 0,
    dailyProtocolRevenue: Number(dailyRevenue?.usd) / 1e18 || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  fetch,
  start: '2025-05-01',
  runAtCurrTime: true,
  methodology: {
    Fees: "Bridge fees include protocol fees charged by Luna Finance plus underlying bridge protocol fees paid by users.",
    Revenue: "Revenue represents fees collected by Luna Finance protocol from bridge transactions, typically 0.1-0.5% of transaction value.",
    ProtocolRevenue: "Protocol revenue is the portion of fees that goes to Luna Finance treasury.",
  }
};

export default adapter;