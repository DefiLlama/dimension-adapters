import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch: any = async (_a: number, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const revenue_split = await queryIndexer(`
      SELECT
        block_number,
        block_time,
        "value" as eth_value,
        encode(transaction_hash, 'hex') AS HASH,
        encode(to_address, 'hex') AS to_address
      FROM
        ethereum.traces
      WHERE
        block_number > 17812609
        and to_address = '\\x9c0096a7668ffe704b7c90c94f69dfac71876722'
        AND from_address = '\\x17272b36596dd16041a6aea49304b7bfec221a15'
        and error is null
        AND block_time BETWEEN llama_replace_date_range;
        `, options);
  revenue_split.forEach((e: any) => dailyFees.addGasToken(Number(e.eth_value)));

  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  deadFrom: '2024-12-14',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-07-30',
    },
  },
  methodology: {
    Fees: 'NFT trading fees paid by users.',
    Revenue: 'NFT trading fees paid by users.',
  }
};

export default adapter;
