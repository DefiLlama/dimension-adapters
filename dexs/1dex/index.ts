import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

async function fetch() {
  const endpoint = `https://api.1dex.com/24h-trade-info`
  const { data: { volume_usdt: dailyVolume } } = await httpGet(endpoint)
  return { dailyVolume, }
}

export default {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: "2025-04-15",
      runAtCurrTime: true,
    },
  },
}
