import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT = "https://swaptitan.net/v1/riftbeam/volume";
const DAY_SECONDS = 86400;
const TIMEOUT_MS = 10000;

const fetch = async (options: FetchOptions) => {
  const from = options.startTimestamp;
  const to = options.endTimestamp ?? from + DAY_SECONDS;
  const url = `${VOLUME_ENDPOINT}?from=${from}&to=${to}`;
  const res = await httpGet(url, { timeout: TIMEOUT_MS });
  if (res.dailyVolume == null) {
    throw new Error(`[riftbeam] missing dailyVolume: ${JSON.stringify(res)}`);
  }
  return {
    dailyVolume: String(res.dailyVolume),
  };
};

const methodology = {
  Volume: "Trading volume routed through RiftBeam DEX aggregator on Solana (Orca CLMM, Raydium CLMM, Pump.fun AMM).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-07-27",
      meta: {
        methodology,
        breakdownMethodology: methodology,
      },
    },
  },
};

export default adapter;