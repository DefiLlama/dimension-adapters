import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const eth_transfer_logs: any = await queryIndexer(`
      SELECT
        sum("value") AS eth_value
      FROM
        ethereum.traces
      WHERE
        block_number > 14645816
        AND to_address = '\\xb16c1342E617A5B6E4b631EB114483FDB289c0A4'
        AND block_time BETWEEN llama_replace_date_range;
        `, options);
  dailyFees.addGasToken(eth_transfer_logs[0].eth_value);
  return { dailyFees, timestamp, dailyRevenue: dailyFees, }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-01-01'
    },
  },
};

export default adapter;
