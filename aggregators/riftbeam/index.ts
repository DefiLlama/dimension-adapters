import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT = "https://swaptitan.net/v1/riftbeam/volume";

const fetch = async (timestamp: number) => {
  const dayEnd = timestamp;
  const dayStart = timestamp - 86400;
  try {
    const url = `${VOLUME_ENDPOINT}?from=${dayStart}&to=${dayEnd}`;
    const res = await httpGet(url);
    return {
      dailyVolume: res.dailyVolume?.toString() ?? "0",
      timestamp,
    };
  } catch (e) {
    return { dailyVolume: "0", timestamp };
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: async () => 1753574400,
      meta: {
        methodology: {
          Volume: "Trading volume routed through RiftBeam on Solana.",
        },
      },
    },
  },
};

export default adapter;
