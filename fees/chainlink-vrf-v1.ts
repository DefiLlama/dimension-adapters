import { SimpleAdapter, ChainBlocks, FetchResultFees, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain, getProvider } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import getTxReceipts from "../helpers/getTxReceipts";

const topic0_v1 = '0xa2e7a402243ebda4a69ceeb3dfb682943b7a9b3ac66d6eefa8db65894009611c';
const topic1_v1 = '0x56bd374744a66d531874338def36c906e3a6cf31176eb1e9afd9f1de69725d51';

const topic0_v2 = '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f37ea0187b9b17e036756e4';
const topic1_v2 = '0x63373d1c4696214b898952999c9aaec57dac1ee2723cec59bea6888f489a9772';

type TAddrress = {
  [l: string | Chain]: string;
}
const address_v1: TAddrress = {
  [CHAIN.ETHEREUM]: '0xf0d54349addcf704f77ae15b96510dea15cb7952',
  [CHAIN.BSC]: '0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31',
  [CHAIN.POLYGON]: '0x3d2341ADb2D31f1c5530cDC622016af293177AE0'
}


const address_v2: TAddrress = {
  [CHAIN.ETHEREUM]: '0x271682DEB8C4E0901D1a1550aD2e64D568E69909',
  [CHAIN.BSC]: '0xc587d9053cd1118f25F645F9E08BB98c9712A4EE',
  [CHAIN.POLYGON]: '0xAE975071Be8F8eE67addBC1A82488F1C24858067',
  [CHAIN.FANTOM]: '0xd5d517abe5cf79b7e95ec98db0f0277788aff634',
  [CHAIN.AVAX]: '0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634',
}

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}
type IFeeV2 = {
  [l: string | Chain]: number;
}
const feesV2: IFeeV2 = {
  [CHAIN.ETHEREUM]: 0.25,
  [CHAIN.BSC]: 0.005,
  [CHAIN.POLYGON]: 0.0005,
  [CHAIN.FANTOM]: 0.0005,
  [CHAIN.AVAX]: 0.005,
}

const feesV1: IFeeV2 = {
  [CHAIN.ETHEREUM]: 2,
  [CHAIN.BSC]: 0.2,
  [CHAIN.POLYGON]: 0.0001,
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

const fetch = (chain: Chain, version: number) => {
  return async (timestamp: number, _: ChainBlocks): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const logs_1: ITx[] = (await sdk.getEventLogs({
      target: version === 1 ? address_v1[chain] : address_v2[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: version === 1 ? [topic0_v1] : [topic0_v2],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx });
    const logs_2: ITx[] = (await sdk.getEventLogs({
      target: version === 1 ? address_v1[chain] : address_v2[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: version === 1 ? [topic1_v1] : [topic1_v2],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx });

    const request_fees: any[] = logs_2.map((e: ITx) => {
      const fees = Number('0x'+e.data.slice(192, 256)) / 10 ** 18;
      const id = e.data.slice(256, 320).toUpperCase();
      return {
        fees: fees,
        id: id
      };
    })
    const exclude: string[] = [];
    const fees_amount = logs_1.map((e: ITx) => {
      const id =  e.data.slice(0, 64).toUpperCase()
      const fees = request_fees.find(e => e.id === id);
      if (!fees?.fees) exclude.push(e.transactionHash);
      return fees?.fees || 0;
    }).reduce((a: number, b: number) => a+b, 0)


    const tx_hash: string[] = [...new Set([...logs_1].map((e: ITx) => e.transactionHash).filter(e => !exclude.includes(e)))]
    const txReceipt: number[] = chain === CHAIN.OPTIMISM ? [] : (await getTxReceipts(chain, tx_hash, { cacheKey: 'chainlink-vrf-v1' }))
      .map((e: any) => {
        const amount = (Number(e?.gasUsed || 0) * Number(e?.effectiveGasPrice || 0)) / 10 ** 18
        return amount
      })
    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = await getPrices([linkAddress, gasToken], timestamp);
    const dailyGas =  txReceipt.reduce((a: number, b: number) => a + b, 0);
    const linkPrice = prices[linkAddress].price
    const gagPrice = prices[gasToken].price
    const dailyGasUsd = dailyGas * gagPrice;
    const dailyFees =(fees_amount * linkPrice);
    const dailyRevenue = dailyFees - dailyGasUsd;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: chain === CHAIN.OPTIMISM ? undefined : dailyRevenue.toString(),
      timestamp
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM, 1),
      start: 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC, 1),
      start: 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON, 1),
      start: 1675382400,
    }
  }
}
export default adapter;
