import PromisePool from "@supercharge/promise-pool";
import { FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const config = {
  scroll: { endpoint: 'https://ambindexer.net/scroll-gcgo/', chainId: '0x82750', poolIdx: '420', start: '2023-11-12', },
  blast: { endpoint: 'https://ambindexer.net/blast-gcgo/', chainId: '0x13e31', poolIdx: '420', start: '2024-03-02', },
  ethereum: { endpoint: 'https://ambindexer.net/gcgo/', chainId: '0x1', poolIdx: '420' },
  // canto: { endpoint: 'https://ambient-graphcache.fly.dev/gcgo/', chainId: '0x1e14', poolIdx: '420' },
  plume_mainnet: { endpoint: 'https://ambindexer.net/plume-gcgo/', chainId: '0x18232', poolIdx: '420', start: '2025-05-14', },
  swellchain: { endpoint: 'https://ambindexer.net/swell-gcgo/', chainId: '0x783', poolIdx: '420', start: '2024-12-24', },
  // plume: { endpoint: 'https://ambindexer.net/plume-gcgo/', chainId: '0x18231', poolIdx: '420', start: '2025-05-14', },
}

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, createBalances, chain }) => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const { poolIdx, chainId, endpoint, } = config[chain]
  const { data } = await httpGet(endpoint + 'pool_list', { params: { poolIdx, chainId } })

  const { errors } = await PromisePool
    .withConcurrency(10)
    .for(data)
    .process(async ({ base, quote }: any) => {
      const { data, } = await httpGet(endpoint + 'pool_stats', { params: { poolIdx, chainId, base, quote, histTime: endTimestamp, } })
      const { data: dataOld } = await httpGet(endpoint + 'pool_stats', { params: { poolIdx, chainId, base, quote, histTime: startTimestamp, } })

      // dailyVolume.add(base, data.baseVolume)
      dailyVolume.add(quote, data.quoteVolume)
      // dailyVolume.subtractToken(base, dataOld.baseVolume)
      dailyVolume.subtractToken(quote, dataOld.quoteVolume)

      // dailyFees.add(base, data.baseVolume * data.feeRate)
      dailyFees.add(quote, data.quoteVolume * data.feeRate)
      // dailyFees.subtractToken(base, dataOld.baseVolume * data.feeRate)
      dailyFees.subtractToken(quote, dataOld.quoteVolume * data.feeRate)
    })
  if (errors?.length) {
    const timeNow = Date.now() / 1e3
    const isCloseToCurrentTime = endTimestamp >= (timeNow - 86400 * 3) // 3 days
    if (!isCloseToCurrentTime) return {}  // ignore errors for historical dates
    throw errors[0];
  }
  return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees, dailyProtocolRevenue: 0 }
}

const methodology = {
  Volume: "Ambient finance trade volume",
  Fees: "Trading fees paid by users",
  Revenue: "Ambient doesnt take any fee share",
  ProtocolRevenue: "Ambient doesnt take any fee share",
  SupplySideRevenue: "All the trading fee goes to liquidity providers",
}

const adapter: any = {}
Object.keys(config).forEach(chain => {
  adapter[chain] = { start: config[chain].start ?? '2023-05-28', }
})

export default {
  fetch,
  adapter,
  version: 2,
  methodology
};
