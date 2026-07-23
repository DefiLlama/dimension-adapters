import { SimpleAdapter } from "../../adapters/types";import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const fetch = async (_: any) => {
  const res = await httpGet("https://api.surge.trade/stats")
  const dailyVolume = res.volume['24hours']
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.RADIXDLT],
  start: '2023-03-29',
  runAtCurrTime: true,
}

export default adapter;
