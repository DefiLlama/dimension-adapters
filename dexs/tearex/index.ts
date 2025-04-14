import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const api = "https://alpha-api.trex.trade/trade";
  const res = await httpGet(api);
  const decimals = 10n ** 6n;

  if (!res || typeof res !== "object" || !("trading" in res)) {
    throw new Error("Invalid response");
  }

  const vol24h = Number(BigInt(res["trading"]["borrowAmount24h"]) / decimals);
  const volAll = Number(BigInt(res["trading"]["totalBorrowAmount"]) / decimals);
  
  return {
    dailyVolume: vol24h,
    totalVolume: volAll,
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
