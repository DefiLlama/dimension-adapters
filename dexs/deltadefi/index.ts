import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_API = "https://api-internal-metrics.deltadefi.io/public/volume/daily";

const fetch = async (timestamp: number) => {
  const response = await httpGet(`${VOLUME_API}?timestamp=${timestamp}`);
  return {
    dailyVolume: response.volume_usd,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2026-01-26",
    },
  },
};

export default adapter;
