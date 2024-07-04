import { BreakdownAdapter, FetchOptions, FetchResultV2, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { adapter_trade } from './gmx-v2-trade/index'


interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0_ins = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_ins = '0xf35c99b746450c623be607459294d15f458678f99d535718db6cfcbccb117c09';

interface IToken {
  amount: number;
  token: string;
}

type TChain = {
  [s: Chain | string]: string;
}

const contract: TChain = {
  [CHAIN.ARBITRUM]: '0xc8ee91a54287db53897056e12d9819156d3822fb',
  [CHAIN.AVAX]: '0xdb17b211c34240b014ab6d61d4a31fa0c0e20c26'
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();
    const swap_logs: ILog[] = await options.getLogs({
      target: contract[options.chain],
      topics: [topic0_ins, topic1_ins],
    });
    const raw_in = swap_logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const volume = Number('0x' + data.slice(53 * 64, (53 * 64) + 64));
      const address = data.slice(27 * 64, (27 * 64) + 64);
      const contract_address = '0x' + address.slice(24, address.length);
      return {
        amount: volume,
        token: contract_address,
      } as IToken
    })

    raw_in.map((e: IToken) => {
      dailyVolume.add(e.token, e.amount)
    })

    return {
      dailyVolume: dailyVolume,
    }
}


const adapter: any = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1688428800,
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 1688428800,
    },
  },
};

const adapters: BreakdownAdapter = {
  version: 2,
  breakdown: {
    "gmx-v2-swap": adapter["adapter"],
    "gmx-v2-trade": adapter_trade["adapter"],
  }
}
export default adapters;
