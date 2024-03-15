import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { queryIndexer } from "../helpers/indexer";

const graph = (_chain: Chain): any => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = options.createBalances();
    const query = await queryIndexer(`
          SELECT value FROM ethereum.transactions
          WHERE block_number > 16416220
          and to_address = '\\xc36d36dd4a45f8817a49d3751557fec9871f0e32'
          and success = true
          and encode(data, 'hex') = ''
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
    query.map((a: any) => dailyFees.addGasToken(a.value))
    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, timestamp }
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: 1673827200,
    },
  }
}

export default adapter;
