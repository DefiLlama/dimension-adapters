import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select 
      sum(case when balance_change/power(10, 9) > 0 then balance_change/power(10, 9) end) as deposits
    from solana.account_activity
    where address = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh'
    and block_time > TIMESTAMP '2025-08-15 00:00:00 UTC' 
    AND TIME_RANGE
  `
  const result = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('solana', Number(result[0].deposits) * (0.0025));

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: '0',
  }
}

const methodology = {
  Fees: "0.25% Fee on each private transaction",
  Revenue: "0.25% Fee on each private transaction",
  ProtocolRevenue: "0.25% Fee on each private transaction",
}

const adapter: Adapter = {
  methodology,
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-08-15',
  isExpensiveAdapter: true,
}

export default adapter;
