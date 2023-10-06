import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import * as sdk from "@defillama/sdk";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IFee {
  fees: number;
  rev: number;
}

const topic0_trade = '0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee'
const contract = '0xa481b139a1a654ca19d2074f174f17d7534e8cec';

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  try {
    const toTimestamp = timestamp
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toBlock = (await getBlock(toTimestamp, CHAIN.AVAX, {}));
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.AVAX, {}));
    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 5000) {
      try {
        const logs: ILog[] = (await sdk.api.util.getLogs({
          target: contract,
          topic: '',
          toBlock: i + 5000 > toBlock ? toBlock : i + 5000,
          fromBlock: i,
          keys: [],
          chain: CHAIN.AVAX,
          topics: [topic0_trade]
        })).output as ILog[];
        _logs = _logs.concat(logs);
        console.log(i)
      } catch {
        console.log(`Failed to fetch logs for block ${i}`)
        continue;
      }
    }
    console.log(_logs.length)

    const fees: IFee[] = _logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const protocolEthAmount = Number('0x'+data.slice(5*64, (5*64)+64)) / 10 ** 18;
      const subjectEthAmount = Number('0x'+data.slice(6*64, (6*64)+64)) / 10 ** 18;
      const creatorEthAmount = Number('0x'+data.slice(7*64, (7*64)+64)) / 10 ** 18;
      return {
        fees: protocolEthAmount+subjectEthAmount+creatorEthAmount,
        rev: protocolEthAmount
      }
    })

    const avaxID = "avax:0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
    const avaxPrice = (await getPrices([avaxID], timestamp))[avaxID].price;
    const dailyFees = fees.reduce((a: number, b: IFee) => a+b.fees, 0) * avaxPrice
    const dailyRevenue = fees.reduce((a: number, b: IFee) => a+b.rev, 0) * avaxPrice
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e;
  }

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: async () => 1630454400,
    }
  }
}

export default adapters;
