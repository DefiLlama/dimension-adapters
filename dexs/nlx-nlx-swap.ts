import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";

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
  [CHAIN.CORE]: '0x29792F84224c77e2c672213c4d942fE280D596ef',
}

const fetch = (chain: Chain) => {
  return async ({ getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {

    const dailyVolume = createBalances()

    const swap_logs: ILog[] = (await getLogs({
      target: contract[chain],
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
      dailyVolume.add(e.token, e.amount)
    })

    return { dailyVolume } as any
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: fetch(CHAIN.CORE),
      start: '2024-04-24',
    },
  },
};

export default adapter;
