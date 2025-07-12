import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FETCH_URL = 'https://api.myx.finance/v2/scan/defilama/trade-volume/stat_by_chain'

type VolumeType = {
  chainId: number,
  volume: string
}

const fetchApi = async (startTime: number, endTime: number) => {
  const rs = await fetchURL(`${FETCH_URL}?startTime=${startTime}&endTime=${endTime}`)
  const data: VolumeType[] = rs?.data ?? []
  return data
}

const fetch = async (options: FetchOptions) => {
  const result = await fetchApi(options.startTimestamp, options.endTimestamp)
  const volumeData: VolumeType = result.find((dataItem) => dataItem.chainId === options.api.chainId) ?? {} as VolumeType
  const oi_url = `https://api.myx.finance/v2/scan/position/history/day_max?chainId=${options.api.chainId}&startTime=${options.startTimestamp}&endTime=${options.endTimestamp}`
  const oiData = (await fetchURL(oi_url)).data
  const openInterestAtEnd = oiData.filter((item) => item.chainId === options.api.chainId).reduce((acc, curr) => acc + +curr.longAmount + +curr.shortAmount, 0)

  return {
    dailyVolume: volumeData?.volume ?? '0',
    openInterestAtEnd,
  }
}

const methodology = {
  Volume: "Sum of the open/close/liquidation of positions.",
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-01-31',
      meta: { methodology }
    },
    [CHAIN.LINEA]: {
      fetch,
      start: '2024-02-21',
      meta: { methodology }
    },
    [CHAIN.OP_BNB]: {
      fetch,
      start: '2024-09-27',
      meta: { methodology }
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2025-03-16',
      meta: { methodology }
    },
  }
}

export default adapter;
