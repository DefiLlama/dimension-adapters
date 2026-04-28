import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_BASE = "https://api.gifted.markets";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const r = await fetchURL(`${API_BASE}/defillama/volume?timestamp=${options.startOfDay}`);

  const dailyVolume = Number(r.data?.dailyVolumeUsd ?? 0);

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  start: '2026-02-01',
};

export default adapter;
