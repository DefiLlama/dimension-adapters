import { FetchOptions, } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";
import { Chain } from "../../../adapters/types";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0_ins = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_ins = '0xf94196ccb31f81a3e67df18f2a62cbfb50009c80a7d3c728a3f542e3abc5cb63';

const topic0_des = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_des = '0x07d51b51b408d7c62dcc47cc558da5ce6a6e0fd129a427ebce150f52b0e5171a';

type TChain = {
  [s: Chain | string]: string;
}

const contract: TChain = {
  [CHAIN.CORE]: '0x29792F84224c77e2c672213c4d942fE280D596ef',
}

const fetch = (chain: Chain) => {
  return async ({ getLogs, }: FetchOptions) => {

    const posistion_logs: ILog[] = (await getLogs({
      target: contract[chain],
      topics: [topic0_ins, topic1_ins]
    })) as ILog[];

    const decress_logs: ILog[] = (await getLogs({
      target: contract[chain],
      topics: [topic0_des, topic1_des]
    })) as ILog[];

    let hash: string[] = [];
    const raw_des = decress_logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const volume = data.slice(102 * 64, (102 * 64) + 64);
      const key = Number('0x' + data.slice(118 * 64, (118 * 64) + 64));
      if (key === 7) return 0;
      hash.push(e.transactionHash);
      // 156
      return Number('0x' + volume) / 1e30;
    })

    const raw_in = posistion_logs.filter(e => !hash.includes(e.transactionHash)).map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const volume = data.slice(100 * 64, (100 * 64) + 64);
      return Number('0x' + volume) / 1e30;
    })



    const dailyVolume: number = [...raw_des, ...raw_in]
      .reduce((a: number, b: number) => a + b, 0);

    return {
      dailyVolume: dailyVolume,
    }
  }
}


const adapter_trade: any = {
  adapter: {
    [CHAIN.CORE]: {
      fetch: fetch(CHAIN.CORE),
      start: '2024-04-24',
    },
  },
};
export {
  adapter_trade
}
