import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const startTime = new Date(fromTimestamp * 1000).toISOString();
  const endTime = new Date(toTimestamp * 1000).toISOString();
  const url = `https://x.rho.trading/api/v1/stats/volume?startTime=${startTime}&endTime=${endTime}`
  const dailyVolume = await fetchURL(url);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-09-22",
};

export default adapter;
