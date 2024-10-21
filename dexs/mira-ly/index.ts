import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpPost } from "../../utils/fetchURL";

const fetchVolume = async (timestamp: number) => {
  const url = 'https://prod.api.mira.ly/pools';
  const body = { "volume_hours": 24, "apr_days": 1 }
  const response = (await httpPost(url, body)).pools
    .map((e => e.details))
  const dailyVolume = response.reduce((acc: any, item: any) => {
    return acc + Number(item.volume)
  }, 0)
  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp,
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.FUEL]: {
      fetch: fetchVolume,
      start: 1601424000,
    }
  }
}

export default adapters
