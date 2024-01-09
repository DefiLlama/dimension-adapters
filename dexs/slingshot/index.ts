import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";

type TContract  = {
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
interface ISwap {
  token0Address: string;
  token1Address: string;
  token0Amount: number;
  token1Amount: number;
}
const fetchVolume = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    try {
      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const logs: ILog[] = (await Promise.all(contract_address[chain].map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0]
      })))).flat();
      const rawData: ISwap[] = logs.map((log: ILog) => {
        const data = log.data.replace('0x', '');
        const token0 = data.slice(0, 64);
        const token1 = data.slice(64, 128);
        const token0Amount = Number('0x'+data.slice(128, 192));
        const token1Amount = Number('0x'+data.slice(192, 256));
        const token0Address = `0x${token0.slice(24, 64)}`;
        const token1Address = `0x${token1.slice(24, 64)}`;
        return {
          token0Address,
          token1Address,
          token0Amount,
          token1Amount
        }
      })
      const coins = [...new Set(rawData.map((e: ISwap) => `${chain}:${e.token0Address}`).concat(rawData.map((e: ISwap) => `${chain}:${e.token1Address}`)))];
      const prices = await getPrices(coins, timestamp);
      const volume: number[] = rawData.map((e: ISwap) => {
        const token0Price = prices[`${chain}:${e.token0Address}`]?.price || 0;
        const token1Price = prices[`${chain}:${e.token1Address}`]?.price || 0;
        const token0Decimals = prices[`${chain}:${e.token0Address}`]?.decimals || 0;
        const token1Decimals = prices[`${chain}:${e.token1Address}`]?.decimals || 0;
        const token0Value = token0Price * (Number(e.token0Amount) / 10 ** token0Decimals);
        const token1Value = token1Price * (Number(e.token1Amount) / 10 ** token1Decimals);
        const untrackAmountUSD = token0Price !== 0 ? token0Value : token1Price !== 0 ? token1Value : 0;
        return untrackAmountUSD;
      })
      const dailyVolume = volume.reduce((a: number, b: number) => a + b, 0);
      return {
        dailyVolume: `${dailyVolume}`,
        timestamp
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: async () => 1683590400
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: async () => 1683590400
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: async () => 1683590400
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume(CHAIN.OPTIMISM),
      start: async () => 1683590400
    },
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 1683590400
    },
    [CHAIN.CANTO]: {
      fetch: fetchVolume(CHAIN.CANTO),
      start: async () => 1683590400
    }
  }
}
export default adapters;
