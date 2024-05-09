import { FetchResultVolume, SimpleAdapter } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0_ins = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_ins = '0xf94196ccb31f81a3e67df18f2a62cbfb50009c80a7d3c728a3f542e3abc5cb63';

const topic0_des = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_des = '0x07d51b51b408d7c62dcc47cc558da5ce6a6e0fd129a427ebce150f52b0e5171a';

const topic0_fees = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_fees = '0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100';

type TChain = {
  [s: Chain | string]: string;
}

const contract: TChain = {
  [CHAIN.ARBITRUM]: '0xc8ee91a54287db53897056e12d9819156d3822fb',
  [CHAIN.AVAX]: '0xdb17b211c34240b014ab6d61d4a31fa0c0e20c26'
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const posistion_logs: ILog[] = (await sdk.getEventLogs({
      target: contract[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_ins, topic1_ins]
    })) as ILog[];

    const decress_logs: ILog[] = (await sdk.getEventLogs({
      target: contract[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_des, topic1_des]
    })) as ILog[];

    // const fees_logs: ILog[] = (await sdk.getEventLogs({
    //   target: contract[chain],
    //   toBlock: toBlock,
    //   fromBlock: fromBlock,
    //   chain: chain,
    //   topics: [topic0_fees, topic1_fees]
    // }))as ILog[];

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
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  }
}


const adapter_trade: any = {
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
export {
  adapter_trade
}
