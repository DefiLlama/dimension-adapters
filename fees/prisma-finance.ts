import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const logsTranferERC20: any[] = await queryIndexer(`
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 17913327
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x000000000000000000000000fdce0267803c6a0d209d3721d2f01fd618e9cbf8'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
  logsTranferERC20.map((p: any) => dailyFees.add(p.contract_address, p.value))
  return { dailyFees, timestamp }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: 1693440000,
    }
  }
}
export default adapter;
