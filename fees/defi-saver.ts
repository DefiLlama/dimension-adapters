import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logsTranferERC20: any[] = await queryIndexer(`
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 13126204
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x0000000000000000000000006467e807db1e71b9ef04e0e3afb962e4b0900b2b'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
  logsTranferERC20.map((p: any) => dailyFees.add(p.contract_address, p.value))
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2022-01-01',
    }
  },
  methodology: {
    Fees: 'Total fees paid by users for using DefiSaver services.',
    Revenue: 'Total fees paid are distributed to DefiSaver.',
    ProtocolRevenue: 'Total fees paid are distributed to DefiSaver.',
  }
}
export default adapter;
