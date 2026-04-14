import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTime = new Date(options.fromTimestamp * 1000).toISOString();
  const endTime = new Date(options.toTimestamp * 1000).toISOString();
  const url = `https://x.rho.trading/api/v1/stats/volume?startTime=${startTime}&endTime=${endTime}`
  const dailyVolume = await fetchURL(url);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-09-22",
};

export default adapter;
