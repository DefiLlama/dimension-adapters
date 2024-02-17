import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (): Promise<FetchResult> => {
  const data = await httpGet('https://cache.jup.ag/stats/day')
  return {
    dailyVolume: data.volumeInUSD[0].amount,
    totalVolume: data.totalVolumeInUSD,
    timestamp: Math.floor( +new Date(data.volumeInUSD[0].groupTimestamp)/1e3),
  };
};

const adapter = {
  breakdown: {
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch,
        runAtCurrTime: true,
        start: 1705968000,
      },
    },
  },
};

export default adapter;
