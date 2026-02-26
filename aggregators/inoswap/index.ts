import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const LLAMA_URL = "https://inoswap.org/api/llama/metrics";

const fetch = async () => {
  const m: any = await fetchURL(LLAMA_URL);
  const dailyVolume = Number(m?.dailyVolumeUsd || 0);
  return {
    dailyVolume: dailyVolume.toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      runAtCurrTime: true,
      start: "2026-02-01",
    },
  },
};

export default adapter;
