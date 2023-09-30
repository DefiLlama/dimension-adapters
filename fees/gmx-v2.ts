import { Chain } from "@defillama/sdk/build/general";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

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

const topic0_fes = "0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160"
const topic1_fee = "0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100"

const contract: TChain = {
  [CHAIN.ARBITRUM]: "0xc8ee91a54287db53897056e12d9819156d3822fb",
  [CHAIN.AVAX]: "0xdb17b211c34240b014ab6d61d4a31fa0c0e20c26",
};

interface IFee {
  token: string;
  borrowing_fees_usd: number;
  position_fee_amount: number;
  collateral_token_price: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    try {
      const fromBlock = await getBlock(fromTimestamp, chain, {});
      const toBlock = await getBlock(toTimestamp, chain, {});

      let _logs: ILog[] = [];
      for(let i = fromBlock; i < toBlock; i += 5000) {
        const logs: ILog[] = (await sdk.api.util.getLogs({
          toBlock: i + 5000,
          fromBlock: i,
          keys: [],
          topic: '',
          topics: [topic0_fes, topic1_fee],
          chain: chain,
          target: contract[chain],
        })).output as ILog[];
        _logs = _logs.concat(logs);
      }

      const raw_in: IFee[] = _logs.map((e: ILog) => {
        const data = e.data.replace('0x', '');
        const borrowing_fees_usd = twosComplementHexToDecimal('0x' + data.slice(64 *131, (131*64) + 64)) / 1e30;
        const position_fee_amount = twosComplementHexToDecimal('0x' + data.slice(64 *171, (171*64) + 64))
        const collateral_token_price = twosComplementHexToDecimal('0x' + data.slice(64 *73, (64*73) + 64)) / 1e30;
        const token = '0x'+data.slice(24 + 64 * 25, 24 + 64 * 25 + 40);
        return {
          token,
          borrowing_fees_usd,
          position_fee_amount,
          collateral_token_price
        };
      });

      const coins = [...new Set(raw_in.map((e: IFee) => `${chain}:${e.token}`))];
      const prices = await getPrices(coins, timestamp);

      const dailyFees = raw_in.map((e:IFee) => {
        const decimals = prices[`${chain}:${e.token}`].decimals;
        return e.borrowing_fees_usd + e.collateral_token_price * (e.position_fee_amount/10**decimals)
      }).reduce((a: number, b: number) => a + b, 0);
      return {
        dailyFees:`${dailyFees}`,
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
