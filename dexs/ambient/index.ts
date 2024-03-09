import PromisePool from "@supercharge/promise-pool";
import { FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const config = {
  scroll: { endpoint: 'https://ambindexer.net/scroll-gcgo/', chainId: '0x82750', poolIdx: '420' },
  blast: { endpoint: 'https://ambindexer.net/blast-gcgo/', chainId: '0x13e31', poolIdx: '420' },
  ethereum: { endpoint: 'https://ambindexer.net/gcgo/', chainId: '0x1', poolIdx: '420' },
  canto: { endpoint: 'https://ambient-graphcache.fly.dev/gcgo/', chainId: '0x1e14', poolIdx: '420' },
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
  if (errors?.length) throw errors
  return { dailyVolume, dailyFees, }
}

const adapter = { fetch, start: 1685232000, }


export default {
  adapter: {
    [CHAIN.ETHEREUM]: adapter,
    [CHAIN.SCROLL]: adapter,
    [CHAIN.CANTO]: adapter,
    [CHAIN.BLAST]: adapter,
  },
  version: 2,
};
