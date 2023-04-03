import { SimpleAdapter, ChainBlocks, FetchResultFees, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { Chain } from "@defillama/sdk/build/general";

type TAddrress = {
  [l: string | Chain]: string;
}
const address_v1: TAddrress = {
  [CHAIN.ETHEREUM]: '0xf0d54349addcf704f77ae15b96510dea15cb7952',
  [CHAIN.BSC]: '0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31',
  [CHAIN.POLYGON]: '0x3d2341ADb2D31f1c5530cDC622016af293177AE0'
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

let chainBlocksStore: IJSON<ChainBlocks> | undefined = undefined

const fetchRequests = (chain: Chain) => {
  return async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
    if (!chainBlocksStore)
      chainBlocksStore = {
        [timestamp]: chainBlocks
      }
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    if (!chainBlocksStore[todaysTimestamp])
      chainBlocksStore[todaysTimestamp] = {}
    const fromBlock = (await getBlock(todaysTimestamp, chain, chainBlocksStore[todaysTimestamp]));
    if (!chainBlocksStore[yesterdaysTimestamp])
      chainBlocksStore[yesterdaysTimestamp] = {}
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, chainBlocksStore[yesterdaysTimestamp]));

    const flipsideChain = chain === "avax" ? "avalanche" : chain
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
      dailyRevenue: (dailyFeesUsd - dailyGasUsd).toString(),
      timestamp
    }
  }

}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchRequests(CHAIN.ETHEREUM),
      start: async () => 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetchRequests(CHAIN.BSC),
      start: async () => 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchRequests(CHAIN.POLYGON),
      start: async () => 1675382400,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchRequests(CHAIN.OPTIMISM),
      start: async () => 1675382400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchRequests(CHAIN.ARBITRUM),
      start: async () => 1675382400,
    },
    [CHAIN.AVAX]: {
      fetch: fetchRequests(CHAIN.AVAX),
      start: async () => 1675382400,
    },
  }
}
export default adapter;
