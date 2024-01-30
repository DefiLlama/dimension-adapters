import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchResultFees } from "../adapters/types";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

type TokenId = {
  [s: string | Chain]: string;
}

const gasTokenId: TokenId = {
  [CHAIN.ETHEREUM]: "coingecko:ethereum",
  [CHAIN.BSC]: "coingecko:binancecoin",
  [CHAIN.ARBITRUM]: "coingecko:ethereum",
}

const chains: string[] = [...new Set([CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.ARBITRUM])];
const build_query = (timestamp: number): string => {
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  return chains.map((chain: Chain) => `
    SELECT
      SUM(${chain === "bsc"?"BNB_VALUE":"eth_value"}),
      '${chain}' as chain
    from
      ${chain}.core.fact_transactions
    WHERE
      to_address = '0xcac0f1a06d3f02397cfb6d7077321d73b504916e'
      AND BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'`).join(" union all ")
}

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const query = build_query(timestamp);
      const value: number = (await queryFlipside(query, 260))
        .map(([fee, chain]: [string, string]) => {
          return {
            fee, chain
          } as any
        }).filter((e: any) => e.chain === chain).map((e: any) => Number(e.fee)).reduce((a: number, b: number) => a + b, 0);
      const amount = value;
      const gasId = gasTokenId[chain];
      const gasIdPrice = (await getPrices([gasId], timestamp))[gasId].price;
      const dailyFees = (amount * gasIdPrice)
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        timestamp
      }
    } catch (err) {
      console.log(err);
      throw err;
    }

  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: graph(CHAIN.ETHEREUM),
        start: async ()  => 1656633600,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async ()  => 1656633600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async ()  => 1675468800,
    },
  }
}

export default adapter;
