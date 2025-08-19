import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.kuma.bid/v1/exchange";

const fetch = async () => {
  const response = await httpGet(URL);
  const { volume24h } = response;

  return {
    dailyVolume: volume24h?.toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    idex: {
      fetch,
      start: "2025-03-06",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
