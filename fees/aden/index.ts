import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FuturesMarketRow {
  symbol: string;
  "24h_amount": string;
  "24h_volume": number;
}

interface FuturesMarketResponse {
  success: boolean;
  data: {
    rows: FuturesMarketRow[];
  };
}

const methodology = {
  Fees: "ADEN charges 0.9 basis points (0.009%) taker fee and 0% maker fee on all trades",
  Revenue: "100% of fees collected go to ADEN protocol as revenue",
  ProtocolRevenue: "All trading fees are retained by ADEN protocol treasury",
};

const TAKER_FEE_RATE = 0.00009; // 0.009% = 0.9 basis points
const MAKER_FEE_RATE = 0; // 0% maker fee

const fetch = async (timestamp: number, _: any, { startOfDay }: FetchOptions) => {
  try {
    // Fetch trading volume data from ADEN API
    const response: FuturesMarketResponse = await fetchURL(
      "https://api.orderly.org/v1/public/futures_market?broker_id=aden"
    );

    if (!response.success || !response.data?.rows) {
      throw new Error("Invalid response from ADEN API");
    }

    // Calculate total 24h volume
    const dailyVolume = response.data.rows.reduce((total, row) => {
      return total + parseFloat(row["24h_amount"] || "0");
    }, 0);

    // Calculate fees based on volume
    // Assuming all volume is taker volume (conservative estimate)
    const dailyFees = dailyVolume * TAKER_FEE_RATE;

    // According to ADEN team, all fees go to protocol revenue
    const dailyRevenue = dailyFees;
    const dailyProtocolRevenue = dailyFees;

    return {
      timestamp: startOfDay,
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailyUserFees: dailyFees.toString(), // All fees are paid by users
    };
  } catch (error) {
    console.error("Error fetching ADEN fees:", error);
    throw error;
  }
};

const adapter: Adapter = {
  adapter: {
    // ADEN operates on Solana, Arbitrum, and BNB Chain via Orderly
    // Using Arbitrum as main chain since API aggregates all chains data
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-07-23', // ADEN launch date
      meta: {
        methodology
      }
    },
  },
};

export default adapter;