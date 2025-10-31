import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBuilderExports } from "../../helpers/orderly";
import { httpGet } from "../../utils/fetchURL";

let asterBuilderData: any = null
async function asterFetch(_: any, _1: any, { dateString }: FetchOptions) {
  const asterVolumeEndpoint = "https://fapi.asterdex.com/fapi/v1/statisticsData/adenTradingInfo?period=DAILy";
  if (!asterBuilderData) asterBuilderData = httpGet(asterVolumeEndpoint).then(({ perps: data }) => {
    const dateDataMap: any = {}
    data.forEach((i: any) => {
      dateDataMap[i.dateString] = i
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
  Fees: "Builder Fees collected from Orderly Network(0.4 bps on taker volume) and Aster Exchange(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
}

const adapter = getBuilderExports({ broker_id: 'aden', start: '2025-07-14', methodology }) as SimpleAdapter

adapter.adapter = {
  [CHAIN.ORDERLY]: { start: '2025-07-14', fetch: async function(_: any, _1: any, options: FetchOptions) { return { ...(await (adapter.fetch as any)(_, _1, options)), dailyHoldersRevenue: 0 } }, },
  [CHAIN.OFF_CHAIN]: { start: '2025-07-19', fetch: asterFetch },
}

export default adapter