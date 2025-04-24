import { Chain } from "@defillama/sdk/build/types";
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
const SWAPS_IO_LAUNCH_TIME = 1704067200

const getRequestBody = (chainId: number, fromTime: number | null = null, toTime: number | null = null) => {
  return {
    "get_from_volume": true,
    "states": ["confirmed","awaiting_confirm"],
    "get_send_gas": true,
    "from_created_at": fromTime,
    "to_created_at": toTime,
    "from_or_to_chains": [chainId]
  }
}

function get_fetch_for_network(chain: Chain) {
  const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const chainId: number | undefined = SUPPORTED_CHAIN_MAPPING[chain] ?? options.api.chainId
    if (!chainId) throw new Error(`Chain ${chain} is not supported`)

    const daily_res_raw = await fetch(BASE_URL + AGGERAGATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(getRequestBody(chainId, options.fromTimestamp, options.toTimestamp))
    })

    const total_res_raw = await fetch(BASE_URL + AGGERAGATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(getRequestBody(chainId))
    })

    const daily_res = daily_res_raw.json()
    const total_res = total_res_raw.json()

    const dailyVolume = daily_res["entries"][0]["get"]["get_from_volume"]
    const totalVolume = total_res["entries"][0]["get"]["get_from_volume"]

    return { dailyVolume, totalVolume }
  }

  return fetch
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