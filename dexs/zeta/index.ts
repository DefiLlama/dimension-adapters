import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const volumeEndpoint = "https://api.zeta.markets/global/stats/";

async function fetch() {
  const volumeResponse = await httpGet(volumeEndpoint);
  const volume24h = volumeResponse.volume_24h;

  return {
    dailyVolume: Math.round(volume24h),
  };
}

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-08-31',
    },
  },
};

export default adapter;
