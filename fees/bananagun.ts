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
      console.log("here");
      const query = `
        select
          ${chain === "bsc"?"BNB_VALUE":"eth_value"}ba
        from
          ${chain}.core.fact_transactions
        WHERE to_address = '0xdc13700db7f7cda382e10dba643574abded4fd5b'
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `
        console.log(query);
      const value: string[] = (await queryFlipside(query)).flat();
      let amount = value.reduce((a: number, b: string) => a + Number(b), 0)
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
    }
  }
}

export default adapter;
