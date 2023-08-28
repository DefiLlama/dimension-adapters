import { Chain } from "@defillama/sdk/build/general";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";

interface ILog {
  address: string;
  data: string;
  topics: string[];
  transactionHash: string;
}

type TChain = {
  [s: Chain | string]: string;
};

const topic0_ins = "0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160";
const topic1_ins = "0xf94196ccb31f81a3e67df18f2a62cbfb50009c80a7d3c728a3f542e3abc5cb63";

const topic0_des = "0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160";
const topic1_des = "0x07d51b51b408d7c62dcc47cc558da5ce6a6e0fd129a427ebce150f52b0e5171a";

const contract: TChain = {
  [CHAIN.ARBITRUM]: "0xc8ee91a54287db53897056e12d9819156d3822fb",
  [CHAIN.AVAX]: "0xdb17b211c34240b014ab6d61d4a31fa0c0e20c26",
};

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    try {
      const fromBlock = await getBlock(fromTimestamp, chain, {});
      const toBlock = await getBlock(toTimestamp, chain, {});

      const logs: ILog[] = (
        await sdk.api.util.getLogs({
          fromBlock: fromBlock,
          toBlock: toBlock,
          keys: [],
          topic: '',
          topics: [topic0_ins, topic1_ins],
          chain: chain,
          target: contract[chain],
        })
      ).output as ILog[];

      const logs_2: ILog[] = (
        await sdk.api.util.getLogs({
          fromBlock: fromBlock,
          toBlock: toBlock,
          keys: [],
          topic: '',
          topics: [topic0_des, topic1_des],
          chain: chain,
          target: contract[chain],
        })
      ).output as ILog[];

      const raw_in = logs.map((e: ILog) => {
        const data = e.data.replace('0x', '');
        const volume = Number('0x'+data.slice(50 * 64, (50 * 64) + 64)) / 1e30;
        const fees = twosComplementHexToDecimal('0x'+data.slice(123 * 64, (123 * 64) + 64)) / 1e30;
        return (volume * 0.0007) + fees
      })

      const raw_des = logs_2.map((e: ILog) => {
        const data = e.data.replace('0x', '');
        const fees = twosComplementHexToDecimal('0x'+data.slice(129 * 64, (129 * 64) + 64)) / 1e30;
        return fees
      })

      const trading_fees = [...raw_in, ...raw_des]
        .filter((e: number) => !isNaN(e))
        .filter((e: number) => e < 1_000_000)
        .reduce((a: number, b: number) => a + b, 0);
      const dailyFees = trading_fees;
      // not include swap fees
      return {
        dailyFees: dailyFees.toString(),
        timestamp,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
};

const twosComplementHexToDecimal = (hexValue: string): number => {
  if (!hexValue.startsWith('0xf')) {
    return Number(hexValue);
  }
  const binaryValue = BigInt(hexValue).toString(2);
  const flippedBinary = binaryValue
    .split('')
    .map((bit: string) => (bit === '0' ? '1' : '0'))
    .join('');
  const twoComplementBinary = (BigInt(`0b${flippedBinary}`) + BigInt(1)).toString(2);
  const decimalValue = parseInt(twoComplementBinary, 2);
  return decimalValue;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1688428800,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1688428800,
    },
  },
};
export default adapter;
