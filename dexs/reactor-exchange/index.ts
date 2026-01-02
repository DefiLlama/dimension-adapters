import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `https://api.reactor.exchange/api/v1/volume/daily?from=${options.startTimestamp}&to=${options.endTimestamp}`
  const resp = await fetchURL(url)

  return { dailyVolume: resp.volumeUSD }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FUEL],
  start: '2025-10-09',
}

export default adapter
