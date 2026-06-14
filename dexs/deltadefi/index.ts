import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_API = "https://api-internal-metrics.deltadefi.io/public/volume/daily";

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(`${VOLUME_API}?timestamp=${options.toTimestamp}`);
  return {
    dailyVolume: response.volume_usd,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2026-01-26",
};

export default adapter;
