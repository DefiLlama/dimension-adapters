import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface TradingPair {
  trading_pairs: string;
  base_currency: string;
  quote_currency: string;
  quote_volume: number;
}

// MetalX DEX - retrieves 24h trading volume broken down by quote currency
const fetchVolume = async () => {
  const url = "https://dex.api.mainnet.metalx.com/dex/v1/cmc";

  const response: TradingPair[] = await httpGet(url);

  // Calculate total volume from quote_volume
  let totalVolume = 0;

  if (Array.isArray(response)) {
    for (const pair of response) {
      if (pair.quote_volume && pair.quote_volume > 0) {
        totalVolume += pair.quote_volume;
      }
    }
  }

  return {
    dailyVolume: totalVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PROTON]: {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: '2022-11-16', // Date of MetalX DEX (Proton DEX) launch
    },
  },
  methodology: {
    Volume: "Trading volume aggregated across all trading pairs on MetalX DEX over the last 24 hours, using quote_volume from each pair"
  }
};

export default adapter;
