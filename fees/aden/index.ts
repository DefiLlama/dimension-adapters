import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBuilderExports } from "../../helpers/orderly";
import { httpGet } from "../../utils/fetchURL";

let asterBuilderData: any = null
async function asterFetch(_: any, _1: any, { dateString }: FetchOptions) {
  const asterVolumeEndpoint = "https://www.asterdex.com/bapi/futures/v1/public/future/volume/builder/daily_stats/aden";
  if (!asterBuilderData) asterBuilderData = httpGet(asterVolumeEndpoint).then(({ data }) => {
    const dateDataMap: any = {}
    data.forEach((i: any) => {
      dateDataMap[i.date.slice(0, 10)] = i
    })
    return dateDataMap
  })

  const data = (await asterBuilderData)[dateString]

  if (!data)
    throw new Error('Data missing for date: ' + dateString)

  const dailyVolume = +data.takerVolume + +data.makerVolume
  const dailyFees = +data.builderFee

  const response: any = { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }

  return response
}

const methodology = {
  Fees: "Builder Fees collected from Orderly Network(0.3 bps on taker volume) and Aster Exchange(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
}

const adapter = getBuilderExports({ broker_id: 'aden', start: '2025-07-14', methodology }) as SimpleAdapter

adapter.adapter = {
  [CHAIN.ORDERLY]: { start: '2025-07-14', fetch: adapter.fetch, },
  [CHAIN.OFF_CHAIN]: { start: '2025-07-19', fetch: asterFetch },
}

export default adapter