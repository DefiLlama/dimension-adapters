import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBuilderExports } from "../../helpers/orderly";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT_MAP = {
  [CHAIN.OFF_CHAIN]: 'https://fapi.asterdex.com/fapi/v1/statisticsData/adenTradingInfo?period=DAILy',
  [CHAIN.GATE]: 'https://mock-server-beta-nine.vercel.app/list',
}

const asterBuilderDataMap: Map<string, Promise<any>> = new Map()

async function commonFetch(type: keyof typeof VOLUME_ENDPOINT_MAP, _: any, _1: any, { dateString }: FetchOptions) {
  const asterVolumeEndpoint = VOLUME_ENDPOINT_MAP[type];
  
  if (!asterBuilderDataMap.has(asterVolumeEndpoint)) {
    asterBuilderDataMap.set(
      asterVolumeEndpoint,
      httpGet(asterVolumeEndpoint).then(({ perps: data }) => {
        const dateDataMap: any = {}
        data.forEach((i: any) => {
          dateDataMap[i.dateString] = i
        })
        return dateDataMap
      })
    )
  }

  const asterBuilderData = asterBuilderDataMap.get(asterVolumeEndpoint)!
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
  [CHAIN.OFF_CHAIN]: { start: '2025-07-19', fetch: (_: any, _1: any, options: FetchOptions) => commonFetch(CHAIN.OFF_CHAIN, _, _1, options) },
  [CHAIN.GATE]: { start: '2025-10-23', fetch: (_: any, _1: any, options: FetchOptions) => commonFetch(CHAIN.GATE, _, _1, options) },
}
  
export default adapter