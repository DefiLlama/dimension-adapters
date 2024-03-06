import { SimpleAdapter, ChainBlocks, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
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
  chain: string;
}

const chains: string[] = [...new Set([CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.AVAX])];

const build_gas_query = (timestamp: number): string => {
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  return chains.map((chain: Chain) => `
    SELECT
      SUM(TX_FEE),
      '${chain}' as chain
    from
      ${chain === "avax" ? "avalanche" : chain}.core.fact_event_logs logs
      JOIN ${chain === "avax" ? "avalanche" : chain}.core.fact_transactions txs ON txs.tx_hash = logs.tx_hash
    WHERE
      txs.BLOCK_NUMBER > 1000000
      and logs.BLOCK_NUMBER > 1000000
      and logs.TOPICS[0] = '0x9e9bc7616d42c2835d05ae617e508454e63b30b934be8aa932ebc125e0e58a64'
      AND logs.BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'`).join(" union all ")
}

const build_link_query = (timestamp: number): string => {
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  return chains.map((chain: Chain) => `
    SELECT
      data,
      topics,
      tx_hash as transactionHash,
      '${chain}' as chain
    from
      ${chain === "avax" ? "avalanche" : chain}.core.fact_event_logs logs
    WHERE
      topics[0] = '0xd8d7ecc4800d25fa53ce0372f13a416d98907a7ef3d8d3bdd79cf4fe75529c65'
      AND logs.BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'`).join(" union all ")
}

const fetchRequests = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks): Promise<FetchResultFees> => {
    const query_paid = build_link_query(timestamp)
    const gas_query = build_gas_query(timestamp)

    const linkPaid_logs: ILog[] = (await queryFlipside(query_paid, 360))
      .map(([data, topics, transactionHash, chain]: [string, string[], string, string]) => {
        return {
          data,
          topics,
          transactionHash,
          chain
        } as ILog
      }).filter((e: ILog) => e.chain === chain);

    const link_amount: number = linkPaid_logs.map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const payments = Number('0x'+data.slice(128, 192)) / 10 ** 18;
      return payments;
    }).reduce((a: number, b: number) => a + b, 0);
    const ethGas = await queryFlipside(gas_query, 360)

    const gas_fees = ethGas.map(([fee, chain]: [string, string]) => {
      return {
        fee, chain
      } as any
    }).filter((e: any) => e.chain === chain).map((e: any) => Number(e.fee)).reduce((a: number, b: number) => a + b, 0);

    const linkAddress = "coingecko:chainlink";
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([linkAddress, gasToken], timestamp))
    const linkPrice = prices[linkAddress].price
    const dailyFeesUsd = link_amount * linkPrice;
    const dailyGasUsd = gas_fees * prices[gasToken].price;

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
      start: 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetchRequests(CHAIN.BSC),
      start: 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchRequests(CHAIN.POLYGON),
      start: 1675382400,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchRequests(CHAIN.OPTIMISM),
      start: 1675382400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchRequests(CHAIN.ARBITRUM),
      start: 1675382400,
    },
    [CHAIN.AVAX]: {
      fetch: fetchRequests(CHAIN.AVAX),
      start: 1675382400,
    },
  },
  isExpensiveAdapter: true,
}
export default adapter;
