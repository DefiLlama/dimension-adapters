import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const STAKE_POOL_RESERVE_ACCOUNT = "C6nDiFyQH8vbVyfGhgpCfzWbHixf5Kq3MUN5vFCdJ4qP";
const STAKE_POOL_WITHDRAW_AUTHORITY = "5hhYv4b1Bt5sdMGYyyvpciwRbyUD1ZWeCmTaQcuvb7Eg";
const LST_FEE_TOKEN_ACCOUNT = "G2hGzCcDUJdtTSVLazEGfaMVEGWxEwWrnyy8TuTmP25j";
const LST_MINT = 'BPSoLzmLQn47EP5aa7jmFngRL8KC3TWAeAwXwZD8ip3P';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT
  });

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.add(LST_MINT, Number(row.amount) * 1e9 || 0, METRIC.MANAGEMENT_FEES);
      dailyProtocolRevenue.add(LST_MINT, Number(row.amount) * 1e9 || 0, METRIC.MANAGEMENT_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Staking rewards from staked SOL on Backpack staked solana',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Includes withdrawal fees and management fees collected by fee collector',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-02-24",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  breakdownMethodology,
};

export default adapter;