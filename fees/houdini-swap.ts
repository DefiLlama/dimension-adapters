import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchResultFees } from "../adapters/types";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

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
    const sql = postgres(process.env.INDEXA_DB!);
    const now = new Date(timestamp * 1e3)
    const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const query = await sql`
          SELECT value FROM ethereum.transactions
          WHERE block_number > 16416220
          and to_address = '\\xc36d36dd4a45f8817a49d3751557fec9871f0e32'
          and success = true
          and encode(data, 'hex') = ''
          and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `
      const amount = query.map((a: any) => Number(a.value) / 10 ** 18)
        .reduce((a: number, b: number) => a + b, 0)
      const gasId = gasTokenId[chain];
      const gasIdPrice = (await getPrices([gasId], timestamp))[gasId].price;
      const dailyFees = (amount * gasIdPrice)
      await sql.end({ timeout: 3 })
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        dailyHoldersRevenue: `${dailyFees}`,
        timestamp
      }
    } catch (err) {
      await sql.end({ timeout: 3 })
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
