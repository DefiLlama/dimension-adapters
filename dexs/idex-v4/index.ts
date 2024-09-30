import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.idex.io/v4/exchange";

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
    "idex-v4": {
      fetch,
      start: 1721312070,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
