import { SimpleAdapter } from "../../adapters/types"
import { httpGet } from "../../utils/fetchURL"

const fetch = async (timestamp: number) => {
  const url = "https://api.glowswap.io/v1/analytics"
  const response = await httpGet(url)
  const dailyVolume = response.data.volUSD.day;
  return {
    dailyVolume,
    timestamp
  }
}
const adapter: SimpleAdapter = {
  adapter: {
    bsquared: {
      fetch,
      start: 0,
      runAtCurrTime: true,
    }
  }
}
export default adapter
