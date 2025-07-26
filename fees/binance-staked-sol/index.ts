import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_FEE_ACCOUNT = "3XGKBh7VuKLXU3NQHsiTX1NPnBSW76ujfzxTdJ4oQ2V9";
const STAKE_POOL_RESERVE_ACCOUNT = "9xcCvbbAAT9XSFsMAsCeR8CEbxutj15m5BfNr4DEMQKn";
const BINANCE_STAKE_POOL_AUTHORITY = "75NPzpxoh8sXGuSENFMREidq6FMzEx4g2AfcBEB6qjCV";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = getSqlFromFile("helpers/queries/solana-liquid-staking-fees.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_account: STAKE_POOL_RESERVE_ACCOUNT,
    authority: BINANCE_STAKE_POOL_AUTHORITY
  });
  const stake_rewards = await queryDuneSql(options, query);

  dailyFees.addCGToken("solana", stake_rewards[0].daily_yield != null ? stake_rewards[0].daily_yield : 0);

  const dailyRevenue = await getSolanaReceived({
    options,
    target: STAKE_POOL_FEE_ACCOUNT
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const meta = {
  methodology: {
    Fees: 'Staking rewards from staked SOL on binance staked solana',
    Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
    ProtocolRevenue: 'Revenue going to treasury/team',
  }
}

export default {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-09-12",
      meta
    }
  },
  isExpensiveAdapter: true
};