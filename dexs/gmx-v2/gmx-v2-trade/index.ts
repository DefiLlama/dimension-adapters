import { FetchOptions, FetchResultV2 } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0_trades = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160';
const topic1_trades = '0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100';

type TChain = {
  [s: Chain | string]: string;
}

const contract: TChain = {
  [CHAIN.ARBITRUM]: '0xc8ee91a54287db53897056e12d9819156d3822fb',
  [CHAIN.AVAX]: '0xdb17b211c34240b014ab6d61d4a31fa0c0e20c26'
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const trade_logs = await options.getLogs({
      target: contract[options.chain],
      topics: [topic0_trades, topic1_trades]
    });
  
    let hash: string[] = [];
    const raw_trades = trade_logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const volume = data.slice(81 * 64, (81 * 64) + 64);
      return Number('0x' + volume) / 1e30;
    })

    const dailyVolume: number = [...raw_trades]
      .reduce((a: number, b: number) => a + b, 0);

    return {
      dailyVolume: `${dailyVolume}`,
    }
}


const adapter_trade: any = {
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
export {
  adapter_trade
}
