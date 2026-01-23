import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const SOMESWAP_API_BASE = process.env.SOMESWAP_API_BASE ?? "https://api-someswap.something.tools";

const fetchVolume: FetchV2 = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const url = `${SOMESWAP_API_BASE}/api/amm/volume?start=${startTimestamp}&end=${endTimestamp}`;
  const response = await httpGet(url);
  const dailyVolume = Number(response?.volumeUsd ?? response?.volume_usd ?? response?.dailyVolume ?? 0);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch: fetchVolume,
    },
  },
};

export default adapter;