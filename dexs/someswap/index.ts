import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const SOMESWAP_API_BASE = process.env.SOMESWAP_API_BASE ?? "https://api-someswap.something.tools";

const parseVolume = (response: any) => {
  const volume = Number(response?.volumeUsd ?? response?.volume_usd ?? response?.dailyVolume ?? 0);
  return Number.isFinite(volume) ? volume : 0;
};

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const commonQuery = `start=${startTimestamp}&end=${endTimestamp}`;
  const volumeUrl = `${SOMESWAP_API_BASE}/api/amm/volume?${commonQuery}`;
  const volumeV2Url = `${SOMESWAP_API_BASE}/api/amm/volume/v2?${commonQuery}`;

  const [volumeResponse, volumeV2Response] = await Promise.all([
    httpGet(volumeUrl),
    httpGet(volumeV2Url).catch(() => null),
  ]);

  const dailyVolume = parseVolume(volumeResponse) + parseVolume(volumeV2Response);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
};

export default adapter;
