import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const transfer_logs = await queryIndexer(`
        SELECT
          encode(data, 'hex') AS data,
          encode(contract_address, 'hex') as contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 15454990
          AND contract_address in ('\\xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '\\xdac17f958d2ee523a2206206994597c13d831ec7')
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x00000000000000000000000004bda42de3bc32abb00df46004204424d4cf8287'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
  // 0xcdd1b25d - replay
  // 0x3593564c - ex

  transfer_logs.map((a: any) => dailyFees.add('0x' + a.contract_address, Number('0x' + a.data)));

  return { timestamp, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-09-01',
    }
  },
  methodology: {
    Fees: "Fees paid from users while using all services.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },

}

export default adapter;
