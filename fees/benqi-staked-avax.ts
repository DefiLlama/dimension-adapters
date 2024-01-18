import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";

const topic0 = '0x8fbf6a230d02fb8f41af8c1ca90b126472e11286c47d7ed86bb2e1fc51a283d8';
const address = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be'
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  try {
    const toTimestamp = timestamp
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toBlock = await getBlock(toTimestamp, CHAIN.AVAX, {})
    const fromBlock = await getBlock(fromTimestamp, CHAIN.AVAX, {})
    const logs: ILog[] = (await sdk.getEventLogs({
      target: address,
      topic: topic0,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.AVAX,
      topics: [topic0]
    })) as ILog[];
    const reward = logs.reduce((acc, log) => {
      const amount = Number(log.data) / 10 ** 18
      return acc + amount
    },0)
    const avaxAddress = `${CHAIN.AVAX}:0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be`
    const prices =  await getPrices([avaxAddress], timestamp)
    const sAVAXPrice = prices[avaxAddress]?.price || 0;
    const dailyFees = (reward * sAVAXPrice) / .90
    const dailySupplySideRevenue = dailyFees * 0.90;
    const dailyRevenue = dailyFees * 0.1;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: async () => 1644710400
    }
  }
}
export default adapters;
