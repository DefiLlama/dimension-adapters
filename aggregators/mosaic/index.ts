import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

const STATS_BASE_URL = "https://stats.mosaic.ag"

const fetch = async (_timestamp: number, _: any, options: FetchOptions) => {
  const dateVolumeData = await fetchURL(
    `${STATS_BASE_URL}/v1/public/volume?from_date=${options.dateString}&to_date=${options.dateString}`
  )
  const volumeData = dateVolumeData.data

  return {
    dailyVolume: volumeData.data[0]?.volume,
  }
}

export default {
  adapter: {
    [CHAIN.MOVE]: {
      fetch: fetch,
      start: "2025-03-10",
    },
  },
}
