import { CHAIN } from "../../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select 
      sum(case when balance_change/power(10, 9) > 0 then balance_change/power(10, 9) end) as deposits,
      count(case when balance_change/power(10, 9) > 0 then 1 end) as deposit_count
    from solana.account_activity
    where address = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh'
    and block_time > TIMESTAMP '2025-08-15 00:00:00 UTC' 
    AND TIME_RANGE
  `
  const result = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  const depositVolume = Number(result[0].deposits) * 0.0035;
  const depositCount = Number(result[0].deposit_count) * 0.006;
  dailyFees.addCGToken('solana', depositVolume + depositCount);
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: '0',
  }
}

const methodology = {
  Fees: "0.35% + 0.006 SOL on each withdrawal",
  Revenue: "0.35% + 0.006 SOL on each withdrawal",
  ProtocolRevenue: "0.35% + 0.006 SOL on each withdrawal",
}

const adapter: Adapter = {
  methodology,
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: '2025-08-15',
  isExpensiveAdapter: true,
}

export default adapter;
