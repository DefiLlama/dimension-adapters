import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const api = "https://alpha-api.trex.trade/trade";
  const res = await httpGet(api);

  return {
    dailyVolume: res.trading.borrowAmount24h / 1e6,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    sei: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
