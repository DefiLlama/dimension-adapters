import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const api = 'https://api.deltatrade.ai/api/home/data'

async function fetchVolume(chain: string) {
  const timestamp = getUniqStartOfTodayTimestamp();
  const res = await httpGet(`${api}?chain=${chain}`);
  const { total_24h, total } = res.data;

  return {
    timestamp,
    dailyVolume: total_24h,
    totalVolume: total,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      fetch: () => fetchVolume('near'),
      runAtCurrTime: true,
    },
    solana: {
      fetch: () => fetchVolume('solana'),
      runAtCurrTime: true,
    },
  },
};

export default adapter;
