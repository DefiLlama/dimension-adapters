import { BreakdownAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { providers } from "ethers";


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
  [CHAIN.POLYGON]: '0xAE975071Be8F8eE67addBC1A82488F1C24858067'
}
const topic0_keeper = '0xcaacad83e47cc45c280d487ec84184eee2fa3b54ebaa393bda7549f13da228f6';
const address_keeper: TAddrress = {
  [CHAIN.ETHEREUM]: '0x7b3EC232b08BD7b4b3305BE0C044D907B2DF960B',
  [CHAIN.BSC]: '0x7b3ec232b08bd7b4b3305be0c044d907b2df960b',
  [CHAIN.POLYGON]: '0x7b3EC232b08BD7b4b3305BE0C044D907B2DF960B'
}
interface ITx {
  data: string;
  transactionHash: string;
}
type IFeeV2 = {
  [l: string | Chain]: number;
}
const feesV2:IFeeV2  = {
  [CHAIN.ETHEREUM]: 0.25,
  [CHAIN.BSC]: 0.005,
  [CHAIN.POLYGON]: 0.0005,
}

const feesV1:IFeeV2  = {
  [CHAIN.ETHEREUM]: 2,
  [CHAIN.BSC]: 0.2,
  [CHAIN.POLYGON]: 0.0001,
}

type TProvider = {
  [l: string | Chain]: {
    url: string;
    chainId: number;
  };
}

type IGasTokenId = {
  [l: string | Chain]: string;
}
const gasTokenId: IGasTokenId = {
  [CHAIN.ETHEREUM]: "coingecko:ethereum",
  [CHAIN.BSC]: "coingecko:binancecoin",
  [CHAIN.POLYGON]: "coingecko:matic-network",
}
const _providers: TProvider =  {
  [CHAIN.ETHEREUM]: {
    url: "https://eth-mainnet.gateway.pokt.network/v1/5f3453978e354ab992c4da79",
    chainId: 1
  },
  [CHAIN.BSC]: {
    url: "https://rpc.ankr.com/bsc",
    chainId: 56
  },
  [CHAIN.POLYGON]: {
    url: "https://rpc-mainnet.maticvigil.com/",
    chainId: 137
  },
}


const fetch = (chain: Chain, version: number) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs_1: ITx[] = (await sdk.api.util.getLogs({
      target: version === 1 ? address_v1[chain] : address_v2[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics:  version === 1 ? [topic0_v1] : [topic0_v2],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const logs_2: ITx[] = (await sdk.api.util.getLogs({
      target: version === 1 ? address_v1[chain] : address_v2[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics:  version === 1 ? [topic1_v1] : [topic1_v2],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});
    const linkAddress = "coingecko:chainlink";
    const linkPrice = (await getPrices([linkAddress], timestamp))[linkAddress].price;
    const fees = version === 1 ? feesV1[chain] : feesV2[chain]
    const dailyFees = ((logs_1.length + logs_2.length) * fees) * linkPrice;
    const dailyRevenue = dailyFees;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  }
}

const fetchKeeper = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: address_keeper[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_keeper],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { ...e,data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});
    const provider = new providers.JsonRpcProvider(_providers[chain].url, _providers[chain].chainId);
    const txReceipt: number[] = (await Promise.all(logs.map((e: ITx) => provider.getTransactionReceipt(e.transactionHash))))
      .map((e: any) => {
        const amount = (Number(e.gasUsed._hex) * Number(e.effectiveGasPrice._hex)) / 10 ** 18
        return amount
      })
    const payAmount: number[] = logs.map((tx: ITx) => {
      const amount = Number('0x'+tx.data.slice(0, 64)) / 10 ** 18
      return amount;
    });
    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([linkAddress, gasToken], timestamp))
    const linkPrice = prices[linkAddress].price
    const gagPrice  =  prices[gasToken].price
    const dailyFees = payAmount.reduce((a: number, b: number) => a+b,0);
    const dailyFeesUsd = dailyFees * linkPrice;
    const dailyGas = txReceipt.reduce((a: number, b: number) => a+b,0);
    const dailyGasUsd = dailyGas * gagPrice;
    const dailyRevenue  = dailyFeesUsd - dailyGasUsd;
    return {
      dailyFees: dailyFeesUsd.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  }

}


const adapter: BreakdownAdapter = {
  breakdown: {
    "vrf v1": {
      [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM, 1),
        start: async ()  => 1675382400,
      },
      [CHAIN.BSC]: {
        fetch: fetch(CHAIN.BSC, 1),
        start: async ()  => 1675382400,
      },
      [CHAIN.POLYGON]: {
        fetch: fetch(CHAIN.POLYGON, 1),
        start: async ()  => 1675382400,
      },
    },
    "vrf v2": {
      [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM, 2),
        start: async ()  => 1675382400,
      },
      [CHAIN.BSC]: {
        fetch: fetch(CHAIN.BSC, 2),
        start: async ()  => 1675382400,
      },
      [CHAIN.POLYGON]: {
        fetch: fetch(CHAIN.POLYGON, 2),
        start: async ()  => 1675382400,
      },
    },
    "keepers": {
      [CHAIN.ETHEREUM]: {
        fetch: fetchKeeper(CHAIN.ETHEREUM),
        start: async ()  => 1675382400,
      },
      [CHAIN.BSC]: {
        fetch: fetchKeeper(CHAIN.BSC),
        start: async ()  => 1675382400,
      },
      [CHAIN.POLYGON]: {
        fetch: fetchKeeper(CHAIN.POLYGON),
        start: async ()  => 1675382400,
      }
    }
  }
}
export default adapter;
