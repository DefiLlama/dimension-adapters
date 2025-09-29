import { Chain } from "../../adapters/types";
import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUPPORTED_CHAIN_MAPPING: { [chain: Chain]: number } = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.POLYGON]: 137,
  [CHAIN.SONIC]: 146,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BASE]: 8453,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BLAST]: 81457,
}

const BASE_URL = 'https://explorer.prod.swaps.io'
const AGGERAGATE_ENDPOINT = '/api/v0/aggregate'
const SWAPS_IO_LAUNCH_TIME = '2024-01-01'

const getRequestBody = (chainId: number, fromTime: number | null = null, toTime: number | null = null) => {
  return {
    "get_from_volume": true,
    "states": ["confirmed","awaiting_confirm"],
    "from_created_at": fromTime,
    "to_created_at": toTime,
    "from_chains": [String(chainId)]
  }
}

const chain_total_cache = {};

async function fetchTotalVolumeCached(chainId: number) {
  const cacheKey = JSON.stringify(chainId);

  if (chain_total_cache[cacheKey]) {
    return chain_total_cache[cacheKey];
  }

  const total_res = await fetch(BASE_URL + AGGERAGATE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(getRequestBody(chainId))
  }).then((response) => response.json());

  chain_total_cache[cacheKey] = total_res;

  return total_res;
}


function get_fetch_for_network(chain: Chain) {
  return async (options: FetchOptions): Promise<FetchResult> => {
    const chainId: number | undefined = SUPPORTED_CHAIN_MAPPING[chain] ?? options.api.chainId
    if (!chainId) throw new Error(`Chain ${chain} is not supported`)

    const daily_res = await fetch(BASE_URL + AGGERAGATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(getRequestBody(chainId, options.fromTimestamp, options.toTimestamp))
    }).then((response) => response.json());

    const dailyVolume = Math.trunc(daily_res["entries"][0]["get"]["from_volume"] / 100)

    return { dailyVolume, }
  }
}

export default {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.keys(SUPPORTED_CHAIN_MAPPING).map(chain => [
        chain,
        { fetch: get_fetch_for_network(chain), start: SWAPS_IO_LAUNCH_TIME }
      ])
    ),
  },
};