import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import { ethers } from "ethers"
import * as sdk from "@defillama/sdk"
import { getPrices } from "../utils/prices"

type TConractAddress = {
  [c: string]: string;
}
const contract_address: TConractAddress = {
  [CHAIN.ETHEREUM]: '0x619Ad2D02dBeE6ebA3CDbDA3F98430410e892882',
  [CHAIN.ARBITRUM]: '0x1f882522df99820df8e586b6df8baae2b91a782d',
  [CHAIN.AVAX]: '0x2b65731a085b55dbe6c7dcc8d717ac36c00f6d19',
  [CHAIN.OPTIMISM]: '0x84e6b05a089d5677a702cf61dc14335b4be5b282',
  [CHAIN.POLYGON]: '0xb2a7f20d10a006b0bea86ce42f2524fde5d6a0f4'
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0 = '0xc1478ebc6913c43dfd556f53459164d7d6a0f586144857acf0e6ade0181fb510'
const event_logFlashLong = 'event LogFlashloan(address indexed account,uint256 indexed route,address[] tokens,uint256[] amounts)';
const contract_interface = new ethers.utils.Interface([
  event_logFlashLong
]);
const fethFees = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp

      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const logs: ILog[] = (await sdk.api.util.getLogs({
        target: contract_address[chain],
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0]
      })).output as ILog[];
      const fees = logs.map((log: ILog) => {
        const decodedLog = contract_interface.parseLog(log);
        const { tokens, amounts } = decodedLog.args;
        return {
          tokens: tokens[0],
          amounts: Number(amounts[0]._hex)
        }
      });
      const coins = fees.map((fee: any) => `${chain}:${fee.tokens}`);
      const prices = await getPrices(coins, timestamp);
      const dailyVolume = fees.map((fee: any) => {
        const decimals = prices[`${chain}:${fee.tokens}`].decimals;
        const price = prices[`${chain}:${fee.tokens}`].price;
        return (fee.amounts / 10 ** decimals) * price
      }).reduce((a: number, b: number) => a + b, 0);
      const dailyFees = dailyVolume * ((5/100)/100);
      return {
        dailyFees: `${dailyFees}`,
        timestamp
      }
    } catch (error) {
      console.error(error)
      throw error;
    }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fethFees(CHAIN.ETHEREUM),
      start: async () => 1630444800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fethFees(CHAIN.ARBITRUM),
      start: async () => 1630444800,
    },
    [CHAIN.AVAX]: {
      fetch: fethFees(CHAIN.AVAX),
      start: async () => 1630444800,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fethFees(CHAIN.OPTIMISM),
      start: async () => 1630444800,
    },
    [CHAIN.POLYGON]: {
      fetch: fethFees(CHAIN.POLYGON),
      start: async () => 1630444800,
    },
  }
}
export default adapters;
