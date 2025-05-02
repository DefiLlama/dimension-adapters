import { DISABLED_ADAPTER_KEY, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import disabledAdapter from "../helpers/disabledAdapter";
import { queryIndexer } from "../helpers/indexer";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
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

  return { dailyFees, dailyRevenue: dailyFees, timestamp }
}

const adapter: SimpleAdapter = {
  deadFrom: '2024-12-14',
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-07-30',
    },
  },
};

export default adapter;
