import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const meteoraStatsEndpoint = "https://met-stats.meteora.ag/defillama/stats";

interface Stats24H {
  dailyVolume: number
  timestamp: number
};

async function fetch(timestamp: number): Promise<Stats24H> {
  let response: Stats24H = await httpGet(meteoraStatsEndpoint);
  return {
    dailyVolume: response.dailyVolume,
    timestamp: timestamp
  };
}

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: 1714435200, // Apr 30 2024 - 00:00:00 UTC
        }
    }
}
