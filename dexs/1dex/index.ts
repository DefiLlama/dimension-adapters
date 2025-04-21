import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const endpoint = `https:///api.1dex.com/24h-trade-info`

async function fetch() {
  const res = await httpGet(endpoint);
  return { dailyVolume: res.data.volume_usdt }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: "2025-04-15",
      runAtCurrTime: true,
    }
  }
}

export default adapter
