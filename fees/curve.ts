import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import dexAdapter from "../dexs/curve";

const fetchBribesRevenue = async (options: FetchOptions) => {
  if (options.chain !== CHAIN.ETHEREUM) {
    return 0
  }
  const bribes: any[] = (await fetchURL(`https://storage.googleapis.com/crvhub_cloudbuild/data/bounties/stats.json`)).claimsLast365Days.claims

  const startOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.startTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })

  const endOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.endTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })

  return (endOfDay.value - startOfDay.value).toString()
}

const baseDexAdapter = dexAdapter.adapter as BaseAdapter

const fetch = async (options: FetchOptions) => {
  const dexData = await (baseDexAdapter[options.chain].fetch as FetchV2)(options)
  const dailyBribesRevenue = await fetchBribesRevenue(options)

  return {
    ...dexData,
    dailyBribesRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: dexAdapter.methodology,
  adapter: Object.keys(baseDexAdapter).reduce((all, chain) => {
    all[chain] = {
      fetch,
      start: baseDexAdapter[chain].start,
    }
    return all
  }, {} as any)
}

export default adapter;
