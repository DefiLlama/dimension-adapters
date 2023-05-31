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
}
const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const query = `
        SELECT
          eth_value
        from
          ethereum.core.fact_transactions
        WHERE
          block_number > 16416220
          and to_address = '0xc36d36dd4a45f8817a49d3751557fec9871f0e32'
          and origin_function_signature = '0x'
          and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `

      const value: string[] = (await queryFlipside(query)).flat();
      let amount = value.reduce((a: number, b: string) => a + Number(b), 0)
      const gasId = gasTokenId[chain];
      const gasIdPrice = (await getPrices([gasId], timestamp))[gasId].price;
      const dailyFees = (amount * gasIdPrice)
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        dailyHoldersRevenue: `${dailyFees}`,
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
        start: async ()  => 1673827200,
    },
  }
}

export default adapter;
