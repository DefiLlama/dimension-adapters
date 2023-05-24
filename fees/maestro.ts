import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

type TokenId = {
  [s: string | Chain]: string;
}

const gasTokenId: TokenId = {
  [CHAIN.ETHEREUM]: "coingecko:ethereum",
  [CHAIN.BSC]: "coingecko:binancecoin",
}
const field: TokenId = {
  [CHAIN.ETHEREUM]: "eth_value",
  [CHAIN.BSC]: "bnb_value",
}
const graph = (chain: Chain) => {
  return async (timestamp: number) => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const query = `
        select
          ${field[chain]}
        from
          ${chain}.core.fact_transactions
        WHERE to_address = '0xcac0f1a06d3f02397cfb6d7077321d73b504916e'
        and ORIGIN_FUNCTION_SIGNATURE = '0x'
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `

      const value: number[] = (await queryFlipside(query)).flat();
      const amount = value.map((_) => 0.01).reduce((a: number, b: number) => a + b, 0)
      const gasId = gasTokenId[chain];
      const gasIdPrice = (await getPrices([gasId], timestamp))[gasId].price;
      const dailyFees = (amount * gasIdPrice)
      return {
        dailyFees: `${dailyFees}`,
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
        start: async ()  => 1683849600,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async ()  => 1683849600,
  },
  }
}

export default adapter;
