import { Chain } from "../../adapters/types";
import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type TContract = {
  [s: string | Chain]: string[];
}
const topic0 = '0x899a8968d68f840cf01fdaf129bf72e96ca51b8ecad8c4f7566938e7a2ba6bcf';
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
const contract_address: TContract = {
  [CHAIN.ARBITRUM]: [
    '0xe8c97bf6d084880de38aec1a56d97ed9fdfa0c9b',
    '0x5543550d65813c1fa76242227cbba0a28a297771'
  ],
  [CHAIN.ETHEREUM]: [
    '0xa46fd59672434d1917972f1469565baeb57ed204'
  ],
  [CHAIN.POLYGON]: [
    '0x0e64c6e3ec9cde45f93da920afaa9ec23afb49ba',
    '0xf2e4209afa4c3c9eaa3fb8e12eed25d8f328171c',
    '0x07e56b727e0eacfa53823977599905024c2de4f0'
  ],
  [CHAIN.OPTIMISM]: [
    '0x00c0184c0b5d42fba6b7ca914b31239b419ab80b',
    '0xedd118e091eee0e7fa9eeb9b4db717518f56cb15'
  ],
  [CHAIN.BSC]: [
    '0x224b239b8bb896f125bd77eb334e302a318d9e33'
  ],
  [CHAIN.CANTO]: [
    '0x8a1d036be71c9c4a6c3d951cc2a3ee028d12d3fa'
  ]
}

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultVolume> => {
    const dailyVolume = createBalances()
    const logs: ILog[] = await getLogs({ targets: contract_address[chain], topics: [topic0] })
    logs.map((log: ILog) => {
      const data = log.data.replace('0x', '');
      const token0 = data.slice(0, 64);
      const token1 = data.slice(64, 128);
      const token0Amount = Number('0x' + data.slice(128, 192));
      const token1Amount = Number('0x' + data.slice(192, 256));
      const token0Address = `0x${token0.slice(24, 64)}`;
      const token1Address = `0x${token1.slice(24, 64)}`;
      dailyVolume.add(token0Address, token0Amount);
    })
    return {
      timestamp, dailyVolume,
    }
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: '2023-05-09'
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: '2023-05-09'
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: '2023-05-09'
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume(CHAIN.OPTIMISM),
      start: '2023-05-09'
    },
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: '2023-05-09'
    },
    [CHAIN.CANTO]: {
      fetch: fetchVolume(CHAIN.CANTO),
      start: '2023-05-09'
    }
  }
}
export default adapters;
