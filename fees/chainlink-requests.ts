import { SimpleAdapter, ChainBlocks, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { Chain } from "@defillama/sdk/build/general";


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

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchRequests = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const flipsideChain = chain === "avax" ? "avalanche" : chain

    const query_paid = `
        SELECT
          data,
          topics,
          tx_hash as transactionHash
        from
          ${flipsideChain}.core.fact_event_logs
        WHERE
          topics[0] = '0xd8d7ecc4800d25fa53ce0372f13a416d98907a7ef3d8d3bdd79cf4fe75529c65'
          AND BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}`

    const gas_query = `
        SELECT
        SUM(TX_FEE)
        from
        ${flipsideChain}.core.fact_event_logs logs
        JOIN ${flipsideChain}.core.fact_transactions txs ON txs.tx_hash=logs.tx_hash
        WHERE
        logs.TOPICS[0] = '0x9e9bc7616d42c2835d05ae617e508454e63b30b934be8aa932ebc125e0e58a64'
        AND logs.BLOCK_NUMBER > ${fromBlock} AND logs.BLOCK_NUMBER < ${toBlock}`

    const linkPaid_logs: ILog[] = (await queryFlipside(query_paid, 260))
      .map(([data, topics, transactionHash]: [string, string[], string]) => {
        return {
          data,
          topics,
          transactionHash
        } as ILog
      })

    const link_amount: number = linkPaid_logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const payments = Number('0x'+data.slice(128, 192)) / 10 ** 18;
      return payments;
    }).reduce((a: number, b: number) => a + b, 0);
    const ethGas = await queryFlipside(gas_query, 210)

    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([linkAddress, gasToken], timestamp))
    const linkPrice = prices[linkAddress].price
    const dailyFeesUsd = link_amount * linkPrice;
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
