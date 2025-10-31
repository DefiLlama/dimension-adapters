import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type PoolData = {
  total_volume: number;
  daily_volume: number;
};

const fetch = (chain: string) => async (timestamp: number) => {
  const from = timestamp - 86400; // 60*60*24
  const to = timestamp;
  const stats: PoolData = await fetchURL(
    `https://api.mantissa.finance/api/pool/stats/volume/${chain}/?from_timestamp=${from}&to_timestamp=${to}`
  );
  return {
    dailyVolume: `${stats.daily_volume}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch("137"),
      start: '2023-03-20',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetch("1101"),
      start: '2023-05-29',
    },
    [CHAIN.MODE]: {
      fetch: fetch("34443"),
      start: '2024-03-06',
    },
  },
};

export default adapter;
