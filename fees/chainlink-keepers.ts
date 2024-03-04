import ADDRESSES from '../helpers/coreAssets.json'
import { SimpleAdapter, ChainBlocks, FetchResultFees, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { getTxReceipts } from "../helpers/getTxReceipts";
import { Chain, getProvider } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";

type TAddrress = {
  [l: string | Chain]: string;
}

const topic0_keeper = '0xcaacad83e47cc45c280d487ec84184eee2fa3b54ebaa393bda7549f13da228f6';
const success_topic = '0x0000000000000000000000000000000000000000000000000000000000000001';
const address_keeper: TAddrress = {
  [CHAIN.ETHEREUM]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.BSC]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.POLYGON]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.FANTOM]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.AVAX]: '0x02777053d6764996e594c3E88AF1D58D5363a2e6',
  [CHAIN.ARBITRUM]: '0x75c0530885F385721fddA23C539AF3701d6183D4',
  [CHAIN.OPTIMISM]: '0x75c0530885F385721fddA23C539AF3701d6183D4'
}
interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

type IGasTokenId = {
  [l: string | Chain]: string;
}
const gasTokenId: IGasTokenId = {
  [CHAIN.ETHEREUM]: "coingecko:ethereum",
  [CHAIN.BSC]: "coingecko:binancecoin",
  [CHAIN.POLYGON]: "coingecko:matic-network",
  [CHAIN.FANTOM]: "coingecko:fantom",
  [CHAIN.AVAX]: "coingecko:avalanche-2",
  [CHAIN.ARBITRUM]: "coingecko:ethereum",
  [CHAIN.OPTIMISM]: "coingecko:ethereum"
}

const fetchKeeper = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.getEventLogs({
      target: address_keeper[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_keeper],
      chain: chain
    })).map((e: any) => { return { ...e, data: e.data.replace('0x', ''), transactionHash: e.transactionHash, } as ITx })
      .filter((e: ITx) => e.topics.includes(success_topic));
    const tx_hash: string[] = [...new Set([...logs].map((e: ITx) => e.transactionHash))]
    const txReceipt: number[] = chain === CHAIN.OPTIMISM ? [] : (await getTxReceipts(chain, tx_hash, { cacheKey: 'chainlink-keepers' }))
      .map((e: any) => {
        const amount = (Number(e?.gasUsed || 0) * Number(e.effectiveGasPrice || 0)) / 10 ** 18
        return amount
      })
    const payAmount: number[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data.slice(0, 64)) / 10 ** 18
      return amount;
    });
    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([linkAddress, gasToken], timestamp))
    const linkPrice = prices[linkAddress].price
    const gagPrice = prices[gasToken].price
    const dailyFees = payAmount.reduce((a: number, b: number) => a + b, 0);
    const dailyFeesUsd = dailyFees * linkPrice;
    const dailyGas = txReceipt.reduce((a: number, b: number) => a + b, 0);
    const dailyGasUsd = dailyGas * gagPrice;
    const dailyRevenue = dailyFeesUsd - dailyGasUsd;
    return {
      dailyFees: dailyFeesUsd.toString(),
      dailyRevenue: chain === CHAIN.OPTIMISM ? undefined : dailyRevenue.toString(),
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchKeeper(CHAIN.ETHEREUM),
      start: 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetchKeeper(CHAIN.BSC),
      start: 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchKeeper(CHAIN.POLYGON),
      start: 1675382400,
    },
    [CHAIN.FANTOM]: {
      fetch: fetchKeeper(CHAIN.FANTOM),
      start: 1675382400,
    },
    [CHAIN.AVAX]: {
      fetch: fetchKeeper(CHAIN.AVAX),
      start: 1675382400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchKeeper(CHAIN.ARBITRUM),
      start: 1675382400,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchKeeper(CHAIN.OPTIMISM),
      start: 1675382400
    }
  }
}
export default adapter;
