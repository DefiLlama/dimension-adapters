import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getModuleEvents, getVersionWindow } from "../../helpers/movement"
import fetchURL from "../../utils/fetchURL"

const STATS_BASE_URL = "https://stats.mosaic.ag"
const ONCHAIN_FROM = 1783123200 // 2026-07-04, stats.mosaic.ag froze that day
const ROUTER_SWAP_EVENT = "0x3f7399a0d3d646ce94ee0badf16c4c3f3c656fe3a5e142e83b5ebc011aa8b3d::router::SwapEvent"

const fetchFromStats = async (options: FetchOptions) => {
  const dateVolumeData = await fetchURL(
    `${STATS_BASE_URL}/v1/public/volume?from_date=${options.dateString}&to_date=${options.dateString}`
  )
  const row = dateVolumeData.data.data[0]
  if (!row || row.date !== options.dateString) throw new Error(`no stats.mosaic.ag volume for ${options.dateString}`)
  return { dailyVolume: row.volume }
}

const fetchFromChain = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const { fromVersion, toVersion } = await getVersionWindow(options)
  const events = await getModuleEvents({ types: [ROUTER_SWAP_EVENT], fromVersion, toVersion })
  for (const { data } of events) {
    dailyVolume.add(data.input_asset, data.input_amount)
  }
  return { dailyVolume }
}

const fetch = async (options: FetchOptions) =>
  options.toTimestamp > ONCHAIN_FROM ? fetchFromChain(options) : fetchFromStats(options)

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // stats endpoint is daily only
  fetch,
  chains: [CHAIN.MOVE],
  start: "2025-03-10",
  methodology: {
    Volume: "Input amount of swaps routed through the Mosaic router: stats.mosaic.ag daily volume until 2026-07-03, on-chain router::SwapEvent from 2026-07-04.",
  },
}

export default adapter
