import { Adapter, FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "./chains";

const statsCache: any = {}
const defaulyBuilderMethodology = {
  Volume: 'Maker/taker volume that flow through the interface',
  Fees: "Builder Fees collected from Orderly Network",
  Revenue: "builder fees",
  ProtocolRevenue: "All the revenue go to the protocol",
}

export function getBuilderExports({ broker_id, start, revenueRatio = 1, protocolRevenueRatio = 1, methodology = defaulyBuilderMethodology }: {
  broker_id: string
  start?: string
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  methodology?: any
}): Adapter {

  const url = `https://api.orderly.org/md/volume/builder/daily_stats?broker_id=${broker_id}`

  async function fetch(_: any, _1: any, { dateString }: FetchOptions) {
    if (!statsCache[broker_id]) statsCache[broker_id] = httpGet(url).then(data => {
      const dateDataMap: any = {}
      data.forEach(i => {
        dateDataMap[i.date.slice(0, 10)] = i
      })
      return dateDataMap
    })

    const data = (await statsCache[broker_id])[dateString]

    if (!data)
      throw new Error('Data missing for date: ' + dateString)

    const dailyVolume = +data.takerVolume + +data.makerVolume
    const dailyFees = +data.builderFee
    const dailyRevenue = dailyFees * revenueRatio
    const dailyProtocolRevenue = dailyRevenue * protocolRevenueRatio

    const response: any = { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue }

    if (revenueRatio < 1)
      response.dailySupplySideRevenue = dailyFees - dailyRevenue

    if (protocolRevenueRatio < 1)
      response.dailyHoldersRevenue = dailyRevenue - dailyProtocolRevenue

    return response
  }

  return {
    version: 1,
    chains: [CHAIN.ORDERLY],
    start,
    methodology,
    fetch,
  }
}