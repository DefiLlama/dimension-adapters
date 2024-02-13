import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const volumeEndpoint = "https://api.zeta.markets/global/stats/";

async function fetch() {
  const volumeResponse = await httpGet(volumeEndpoint);
  const volume24h = volumeResponse.volume_24h;

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
        start: 1693497600,
      },
    },
  },
};

export default adapter;
