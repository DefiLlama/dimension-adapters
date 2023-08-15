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

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const query = `
        select
          ${chain === "bsc"?"BNB_VALUE":"eth_value"}
        from
          ${chain}.core.fact_transactions
        WHERE to_address = '0xcac0f1a06d3f02397cfb6d7077321d73b504916e'
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `

      const value: string[] = (await queryFlipside(query)).flat();
      let amount = value.reduce((a: number, b: string) => a + Number(b), 0)
      amount = chain === CHAIN.ARBITRUM  ? (amount / 10 ** 18) : amount;
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
