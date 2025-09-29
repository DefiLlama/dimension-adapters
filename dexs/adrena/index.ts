import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type PoolHighLevelStats = {
  start_date: string,
  end_date: string;
  daily_volume_usd: number;
  daily_fee_usd: number;
}

async function fetch({ endTimestamp, }: FetchOptions) {
  const endDate = new Date(endTimestamp * 1000).toISOString();
  const stats: PoolHighLevelStats = (await fetchURL(`https://datapi.adrena.xyz/pool-high-level-stats?end_date=${endDate}`)).data;

  return {
    dailyVolume: stats.daily_volume_usd,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2024-11-18',
    }
  },
  fetch,
  methodology: {
    Volumes: 'Sum of all open/close/increase/liquidate position volumes.',
  },
}

export default adapter;
