import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";

type TContractAddress = {
  [key: string | Chain]: string;
}
type TBrokerID = {
  [s: string | Chain]: number[];
}
const brokerID: TBrokerID = {
  [CHAIN.BSC]: [2], // 2 is for pancakeswap
}
const contract_address: TContractAddress = {
  [CHAIN.BSC]: '0x1b6f2d3844c6ae7d56ceb3c3643b9060ba28feb0',
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
const topic_0_open = '0xa858fcdefab65cbd1997932d8ac8aa1a9a8c46c90b20947575525d9a2a437f8c'


const fetchVolume = (chain: Chain) => {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 86400;
    const toTimestamp = timestamp;
    try {

      const fromBlock = await getBlock(fromTimestamp, chain, {});
      const toBlock = await getBlock(toTimestamp, chain, {});
      const logs_open: ILog[] = (await sdk.api.util.getLogs({
        target: contract_address[chain],
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic_0_open]
      })).output as ILog[];

      // calculate volume when open use entry price and qty
      const value = logs_open.map((e: ILog) => {
        // 14 -> qty
        // 2 -> price
        // 8 -> brokerID
        const data = e.data.replace('0x', '');
        const price = Number('0x' + data.slice(128, 192)) / 10 ** 8;
        const qty = Number('0x' + data.slice(64 * 14, (64 * 14) + 64)) / 10 ** 10;
        const _brokerID = Number('0x' + data.slice(64 * 8, (64 * 8) + 64));
        if (!brokerID[chain].includes(_brokerID)) {
          return price * qty;
        }
        return 0;

      }).reduce((a: number, b: number) => a + b, 0);

      const dailyVolume = value;
      return {
        dailyVolume: `${dailyVolume}`,
        timestamp,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 1688688000,
    },
  },
};

export default adapter;
