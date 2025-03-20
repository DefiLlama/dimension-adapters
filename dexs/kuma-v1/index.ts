import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.kuma.bid/v1/exchange";

const fetch = async () => {
  const response = await httpGet(URL);
  const { totalVolume, volume24h } = response;

  return {
    totalVolume: totalVolume?.toString(),
    dailyVolume: volume24h?.toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    idex: {
      fetch,
      start: "2024-07-18",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
