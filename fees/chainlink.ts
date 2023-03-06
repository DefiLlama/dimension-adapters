import { BreakdownAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { Chain, getProvider } from "@defillama/sdk/build/general";


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
const topic0_keeper = '0xcaacad83e47cc45c280d487ec84184eee2fa3b54ebaa393bda7549f13da228f6';
const success_topic = '0x0000000000000000000000000000000000000000000000000000000000000001';
const address_keeper: TAddrress = {
  [CHAIN.ETHEREUM]: '0x7b3EC232b08BD7b4b3305BE0C044D907B2DF960B',
  [CHAIN.BSC]: '0x7b3ec232b08bd7b4b3305be0c044d907b2df960b',
  [CHAIN.POLYGON]: '0x7b3EC232b08BD7b4b3305BE0C044D907B2DF960B',
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
type IFeeV2 = {
  [l: string | Chain]: number;
}
const feesV2:IFeeV2  = {
  [CHAIN.ETHEREUM]: 0.25,
  [CHAIN.BSC]: 0.005,
  [CHAIN.POLYGON]: 0.0005,
  [CHAIN.FANTOM]: 0.0005,
  [CHAIN.AVAX]: 0.005,
}

const feesV1:IFeeV2  = {
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
  [CHAIN.ARBITRUM]:  "coingecko:ethereum",
  [CHAIN.OPTIMISM]: "coingecko:ethereum"
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

    const provider = getProvider(chain);
    const txReceipt: number[] =  chain === CHAIN.OPTIMISM ? [] : (await Promise.all([...logs_1,...logs_2].map((e: ITx) => provider.getTransactionReceipt(e.transactionHash))))
      .map((e: any) => {
        const amount = (Number(e.gasUsed._hex) * Number(e.effectiveGasPrice?._hex || 0)) / 10 ** 18
        return amount
      })
    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = await getPrices([linkAddress, gasToken], timestamp);
    const dailyGas = txReceipt.reduce((a: number, b: number) => a+b,0);
    const linkPrice = prices[linkAddress].price
    const gagPrice  =  prices[gasToken].price
    const dailyGasUsd = dailyGas * gagPrice;
    const fees = version === 1 ? feesV1[chain] : feesV2[chain]
    const dailyFees = ((logs_1.length + logs_2.length) * fees) * linkPrice;
    const dailyRevenue = dailyFees - dailyGasUsd;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: chain === CHAIN.OPTIMISM ? undefined : dailyRevenue.toString(),
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
    })).output.map((e: any) => { return { ...e,data: e.data.replace('0x', ''), transactionHash: e.transactionHash, } as ITx})
      .filter((e: ITx) => e.topics.includes(success_topic));
    const provider = getProvider(chain);
    const txReceipt: number[] =  chain === CHAIN.OPTIMISM ? [] : (await Promise.all(logs.map((e: ITx) => provider.getTransactionReceipt(e.transactionHash))))
      .map((e: any) => {
        const amount = (Number(e.gasUsed._hex) * Number(e.effectiveGasPrice?._hex || 0)) / 10 ** 18
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
      dailyRevenue: chain === CHAIN.OPTIMISM ? undefined : dailyRevenue.toString(),
      timestamp
    }
  }
}

const fetchRequests = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

    const flipsideChain = chain === "avax"?"avalanche":chain
    const linkPaid = await queryFlipside(`SELECT SUM(EVENT_INPUTS['payment']) / 1e18 as payments, COUNT(*) from ${flipsideChain}.core.fact_event_logs WHERE EVENT_NAME = 'OracleRequest'
      AND BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}`)
    const ethGas = await queryFlipside(`
  SELECT
    SUM(TX_FEE)
  from
    ${flipsideChain}.core.fact_event_logs logs
    JOIN ${flipsideChain}.core.fact_transactions txs ON txs.tx_hash=logs.tx_hash
  WHERE
    logs.TOPICS[0] = '0x9e9bc7616d42c2835d05ae617e508454e63b30b934be8aa932ebc125e0e58a64'
    AND logs.BLOCK_NUMBER > ${fromBlock} AND logs.BLOCK_NUMBER < ${toBlock}`)

    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([linkAddress, gasToken], timestamp))
    const linkPrice = prices[linkAddress].price
    const dailyFeesUsd = (linkPaid[0][0] ?? 0) * linkPrice;
    const dailyGasUsd = ethGas[0][0] * prices[gasToken].price;
    return {
      dailyFees: dailyFeesUsd.toString(),
      dailyRevenue: (dailyFeesUsd-dailyGasUsd).toString(),
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
      [CHAIN.FANTOM]: {
        fetch: fetch(CHAIN.FANTOM, 2),
        start: async ()  => 1675382400,
      },
      [CHAIN.AVAX]: {
        fetch: fetch(CHAIN.AVAX, 2),
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
      },
      [CHAIN.FANTOM]: {
        fetch: fetchKeeper(CHAIN.FANTOM),
        start: async ()  => 1675382400,
      },
      [CHAIN.AVAX]: {
        fetch: fetchKeeper(CHAIN.AVAX),
        start: async ()  => 1675382400,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchKeeper(CHAIN.ARBITRUM),
        start: async ()  => 1675382400,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetchKeeper(CHAIN.OPTIMISM),
        start: async ()  => 1675382400,
      }
    },
    "requests": {
      [CHAIN.ETHEREUM]: {
        fetch: fetchRequests(CHAIN.ETHEREUM),
        start: async ()  => 1675382400,
      },
      [CHAIN.BSC]: {
        fetch: fetchRequests(CHAIN.BSC),
        start: async ()  => 1675382400,
      },
      [CHAIN.POLYGON]: {
        fetch: fetchRequests(CHAIN.POLYGON),
        start: async ()  => 1675382400,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetchRequests(CHAIN.OPTIMISM),
        start: async ()  => 1675382400,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchRequests(CHAIN.ARBITRUM),
        start: async ()  => 1675382400,
      },
      [CHAIN.AVAX]: {
        fetch: fetchRequests(CHAIN.AVAX),
        start: async ()  => 1675382400,
      },
    }
  }
}
export default adapter;
