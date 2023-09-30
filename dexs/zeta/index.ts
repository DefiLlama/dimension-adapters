import axios from "axios";
import { CHAIN } from "../../helpers/chains";

const volumeEndpoint = "https://api.zeta.markets/global/stats/";

async function fetch() {
  const volumeResponse = await axios.get(volumeEndpoint);
  const volume24h = volumeResponse.data.volume_24h;

  return {
    dailyVolume: Math.round(volume24h),
    timestamp: Date.now() / 1e3,
  };
}

const adapter = {
  breakdown: {
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch(),
        runAtCurrTime: true,
        start: async () => 1693497600,
      },
    },
  },
};

export default adapter;
