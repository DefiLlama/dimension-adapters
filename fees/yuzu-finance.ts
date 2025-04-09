import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


async function fetch() {
  let page = 1
  const allItems = []
  while (true) {
    const { total, data } = await httpGet(`https://mainnet-api.yuzu.finance/v1/pools?page=${page}&pageSize=99`)
    allItems.push(...data)
    if (allItems.length >= total)
      break;
    page++
  }
  let dailyFees = 0
  let dailyVolume = 0
  for (const item of allItems) {
    dailyFees += item.volume24h * (item.feeRate / 1e6)
    dailyVolume += +item.volume24h
  }
  return { dailyFees, dailyVolume }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.MOVE]: {
      fetch, runAtCurrTime: true,
    }
  }
}