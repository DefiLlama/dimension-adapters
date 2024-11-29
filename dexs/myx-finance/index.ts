import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const FETCH_URL = 'https://api.myx.finance/v2/scan/defilama/trade-volume/stat_by_chain'

type VolumeType = {
  chainId: number,
  volume: string
}

const methodology = {
  TotalVolume: "Total Volume from the sum of the open/close/liquidation of positions.",
  DailyVolume: "Daily Volume from the sum of the open/close/liquidation of positions.",
}

const fetchApi = async (startTime: number, endTime: number) => {
  const rs = await fetchURL(`${FETCH_URL}?startTime=${startTime}&endTime=${endTime}`)
  const data: VolumeType[] = rs?.data ?? []

  return data
}

const getFetch = async ({ fromTimestamp, toTimestamp, api }: FetchOptions) => {
  const result = await fetchApi(fromTimestamp, toTimestamp)

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((fromTimestamp * 1000)))

  const volumeData: VolumeType = result.find((dataItem) => dataItem.chainId === api.chainId) ?? {} as VolumeType

  return {
    timestamp: dayTimestamp,
    dailyVolume: volumeData?.volume ?? '0',
  }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1706659200,
  [CHAIN.LINEA]: 1708473600,
  [CHAIN.OP_BNB]: 1727443900,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFetch,
      start: startTimestamps[CHAIN.ARBITRUM],
      meta: {
        methodology
      }
    },
    [CHAIN.LINEA]: {
      fetch: getFetch,
      start: startTimestamps[CHAIN.LINEA],
      meta: {
        methodology
      }
    },
    [CHAIN.OP_BNB]: {
      fetch: getFetch,
      start: startTimestamps[CHAIN.OP_BNB],
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
