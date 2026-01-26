import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "8Yz53yBLY5M8riwQ2qmJR3cQxiTmBvT9n1GDUJJTJo9";
const STAKE_POOL_WITHDRAW_AUTHORITY = "GiqwVAud4dH939qajy4F33Cht84kzutxJnGHez4urXnJ";
const LST_FEE_TOKEN_ACCOUNT = "EJFWuuqatTzwmL4oh4XrwtFHL4twbnAqSfdQRzkLxArT";
const LST_MINT = 'CDCSoLckzozyktpAp9FWT3w92KFJVEUxAU7cNu2Jn3aX';

const chainConfig = {
  [CHAIN.SOLANA]: { start: '2025-03-31' },
  [CHAIN.CRONOS]: { start: '2024-02-01' },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
      stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
      lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
      lst_mint: LST_MINT
    });

    const results = await queryDuneSql(options, query);

    results.forEach((row: any) => {
      if (row.metric_type === 'dailyFees') {
        dailyFees.addCGToken("solana", row.amount || 0);
      } else if (row.metric_type === 'dailyRevenue') {
        dailyRevenue.add(LST_MINT, Number(row.amount) * 1e9 || 0);
      }
    });
  }
  else if (options.chain === CHAIN.CRONOS) {
    const token = '0x7a7c9db510aB29A2FC362a4c34260BEcB5cE3446'
    const totalSupply = await options.fromApi.call({ target: token, abi: "uint256:totalSupply" });
    const exchangeRateBefore = await options.fromApi.call({ target: token, abi: "uint256:exchangeRate" });
    const exchangeRateAfter = await options.toApi.call({ target: token, abi: "uint256:exchangeRate" });
    const df = (totalSupply * (exchangeRateAfter - exchangeRateBefore)) / 1e18 // 15% is the commission for staked ETH
    dailyFees.add(token, Number(df))
    dailyRevenue.add(token, Number(df) * 0.15)
  } else {
    throw new Error(`Chain ${options.chain} not supported`);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked ETH and SOL on Crypto.com EARN Product',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
  version: 1,
  fetch,
  adapter: chainConfig,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
};
