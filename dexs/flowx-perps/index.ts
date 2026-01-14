import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyVolume = await fetchURL(`https://api.flowx.finance/flowx-be/api/perp-tracking/volume-in-timerange?startTime=${fromTimestamp * 1000}&endTime=${toTimestamp * 1000}`);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-10-01",
};

export default adapter;
