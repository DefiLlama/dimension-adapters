import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryIndexer } from "../../helpers/indexer";
const fetch = async (
  timestamp: number,
  _: any,
  options: FetchOptions
): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const logsTranferERC20: any[] = await queryIndexer(
    `
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          arbitrum.event_logs
        WHERE
          block_number > 210487219
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x0000000000000000000000007781597dd4f782f6d11840c34160227204f7afa9'
          AND block_time BETWEEN llama_replace_date_range;
          `,
    options
  );
  logsTranferERC20.map((p: any) => dailyFees.add(p.contract_address, p.value));
  return { dailyFees, dailyRevenue: dailyFees, timestamp };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: 210487219,
    },
  },
};
export default adapter;
