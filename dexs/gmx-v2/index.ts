import { BreakdownAdapter, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
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

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const balances = new sdk.Balances({ chain, timestamp })
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const swap_logs: ILog[] = (await sdk.getEventLogs({
      target: contract[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_ins, topic1_ins]
    })) as ILog[];

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
      balances.add(e.token, e.amount)
    })

    return {
      dailyVolume: await balances.getUSDString(),
      timestamp
    }
  }
}


const adapter: any = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1688428800,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1688428800,
    },
  },
};

const adapters: BreakdownAdapter = {
  breakdown: {
    "gmx-v2-swap": adapter["adapter"],
    "gmx-v2-trade": adapter_trade["adapter"],
  }
}
export default adapters;
