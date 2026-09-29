import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://data.velocity.exchange/stats/markets/volume";

interface MarketVolume {
  marketType: string;
  quoteVolume: string;
}

interface VolumeResponse {
  success: boolean;
  startTs: number;
  endTs: number;
  markets: MarketVolume[];
}

const fetch = async (options: FetchOptions) => {
  const startTimestamp = options.startTimestamp + 1;
  const { endTimestamp } = options;
  const response: VolumeResponse = await fetchURL(`${API_URL}?startTs=${startTimestamp}&endTs=${endTimestamp}`);

  if (!response.success || response.startTs !== startTimestamp || response.endTs !== endTimestamp || !Array.isArray(response.markets)) {
    throw new Error("Velocity volume API returned an invalid time window or markets list");
  }

  const perpMarkets = response.markets.filter((market) => market.marketType === "perp");
  if (!perpMarkets.length) throw new Error("Velocity volume API returned no perp markets");

  const dailyVolume = perpMarkets.reduce((total, market) => {
    const volume = Number(market.quoteVolume);
    if (typeof market.quoteVolume !== "string" || !market.quoteVolume.trim() || !Number.isFinite(volume) || volume < 0) {
      throw new Error("Velocity volume API returned an invalid perp quote volume");
    }
    return total + volume;
  }, 0);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  chains: [CHAIN.SOLANA],
  start: "2026-07-06",
  fetch,
  methodology: {
    Volume: "Perpetual market quote volume (USDT) from Velocity's timestamped markets API; spot markets are excluded.",
  },
};

export default adapter;
