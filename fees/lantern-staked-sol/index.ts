import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "EH7jVtxJbpMNwmkJFREAEPBseTmE5CTNtLC4Wh8u48eS";
const STAKE_POOL_WITHDRAW_AUTHORITY = "6Sw4WcMTakZFrd19Q4hTH8ewiLxXXTCuBdVxAaneg1fo";
const LST_FEE_TOKEN_ACCOUNT = "3BTsa5vnmQ2CfDNNABjSPff6RqdXQUxjcKwGiF4mn3aE";
const LST_MINT = 'LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg';

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

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.addCGToken("lantern-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Lantern staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-07-17",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};