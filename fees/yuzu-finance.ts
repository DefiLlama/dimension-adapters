import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const bad_token = [
  "0x28c247fc7adda11a40f348f0252c346481e902ab3e667fdceb9c7a30b49bc54a"
]

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
    if (bad_token.includes(item.token0) || bad_token.includes(item.token1)){
      continue
    }
    dailyFees += item.volume24h * (item.feeRate / 1e6)
    dailyVolume += +item.volume24h
  }
  const dailyRevenue = dailyFees * (20/100)
  return { dailyFees, dailyVolume, dailyRevenue }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.MOVE]: {
      fetch, runAtCurrTime: true,
    }
  }
}
