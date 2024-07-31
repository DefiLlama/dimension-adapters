import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const meteoraStatsEndpoint = 'https://amm-v2.meteora.ag/pools/v2';

interface Stats24H {
  dailyVolume: number
  timestamp: number
};

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
  }>
}

async function fetch(timestamp: number): Promise<Stats24H> {
  let dailyVolume = 0;
  let page = 0;
  try {
    while (true) {
      const url = `${meteoraStatsEndpoint}?page=${page}&size=500`;
      const response:Pool = (await httpGet(url));
      response.data.forEach(pool => {
        dailyVolume += pool.trading_volume;
      })
      if (response.data.length < 500) {
        break;
      }
      if (page > 50) break;
      page++;
    }
    return {
      dailyVolume: dailyVolume,
      timestamp: timestamp
    }
  } catch (error) {
    return {
      dailyVolume: dailyVolume,
      timestamp: timestamp
    }
  }

}

export default {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: 1714435200, // Apr 30 2024 - 00:00:00 UTC
        }
    }
}
