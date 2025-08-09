import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface FuturesMarketRow {
  symbol: string;
  "24h_amount": string;
  "24h_volume": number;
  open_interest: number;
  mark_price: number;
}

interface FuturesMarketResponse {
  success: boolean;
  data: {
    rows: FuturesMarketRow[];
  };
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  try {
    // Using ADEN's CMC API endpoint with broker_id parameter
    const response: FuturesMarketResponse = await fetchURL(
      "https://api.orderly.org/v1/public/futures_market?broker_id=aden"
    );

    if (!response.success || !response.data?.rows) {
      throw new Error("Invalid response from ADEN API");
    }

    // Calculate total 24h volume (already in USD)
    const dailyVolume = response.data.rows.reduce((total, row) => {
      return total + parseFloat(row["24h_amount"] || "0");
    }, 0);

    // Calculate total open interest (need to multiply by mark price)
    const openInterest = response.data.rows.reduce((total, row) => {
      const oi = row.open_interest || 0;
      const markPrice = row.mark_price || 0;
      return total + (oi * markPrice);
    }, 0);

    return {
      dailyVolume: dailyVolume.toString(),
      openInterestAtEnd: openInterest.toString(),
      timestamp,
    };
  } catch (error) {
    console.error("Error fetching ADEN data:", error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    // ADEN operates on Solana, Arbitrum, and BNB Chain through Orderly Network
    // Using Arbitrum as the main chain since the API aggregates all chains data
    [CHAIN.ARBITRUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-07-23', // ADEN launch date
    },
  },
};

export default adapter;