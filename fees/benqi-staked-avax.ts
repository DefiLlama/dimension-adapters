import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const topic0 = '0x8fbf6a230d02fb8f41af8c1ca90b126472e11286c47d7ed86bb2e1fc51a283d8';
const address = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be'

const fetchFees = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const logs = await getLogs({ target: address, topics: [topic0] })
  logs.map((log) => dailyFees.add('0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be', log.data))
  dailyFees.resizeBy(1 / 0.9)
  const dailyRevenue = dailyFees.clone(0.1)
  const dailySupplySideRevenue = dailyFees.clone(0.9)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, timestamp }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: 1644710400
    }
  }
}
export default adapters;
