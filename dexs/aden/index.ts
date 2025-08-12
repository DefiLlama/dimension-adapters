import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (): Promise<FetchResultVolume> => {
  // Using ADEN's CMC API endpoint with broker_id parameter
  const response: FuturesMarketResponse = await httpGet(
    "https://api.orderly.org/v1/public/futures_market?broker_id=aden"
  );

  if (!response.success || !response.data?.rows) {
    throw new Error("Invalid response from ADEN API");
  }

  // Calculate total 24h volume using 24h_amount (USD value)
  // This is already the pure ADEN volume without double counting
  // Market makers use Orderly's interface and their volume is recorded on Orderly
  const dailyVolume = response.data.rows.reduce((total, row) => {
    return total + parseFloat(row["24h_amount"] || "0");
  }, 0);

  return {
    dailyVolume: dailyVolume.toString(),
  };
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