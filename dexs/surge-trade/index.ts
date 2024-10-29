import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const fetchVolume = async (timestamp: number) => {
  const res = await httpGet("https://api.surge.trade/stats")
  const dailyVolume = res.volume["24hours"]
  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp,
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: 1680048000,
    }
  }
}
export default adapters
