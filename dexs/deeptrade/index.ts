import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const BASE_URL = 'https://indexer-api.deeptrade.space';
const PATH = '/deeptrade_historical_volume_all_markets';
const API_URL = `${BASE_URL}${PATH}`;

interface PoolVolume {
  pool_name: string;
  base_coin_type: string;
  quote_coin_type: string;
  raw_volume: number;
}

const fetch = async (options: FetchOptions) => {
  const apiKey = getEnv('DEEPTRADE_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPTRADE_API_KEY is not set');
  }

  const url = `${API_URL}?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}&volume_in_base=false`;
  const data: PoolVolume[] = await httpGet(url, {
    headers: { "X-Api-Key": apiKey },
  });

  const dailyVolume = options.createBalances();
  
  // Convert raw volume to USD
  for (const pool of data) {
    dailyVolume.add(pool.quote_coin_type, pool.raw_volume);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of trading volume in USD across all markets.",
};

const adapter: SimpleAdapter = {
  version: 2,
  doublecounted: true, //DeepBook
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-04-11",
    },
  },
  methodology,
};

export default adapter;
