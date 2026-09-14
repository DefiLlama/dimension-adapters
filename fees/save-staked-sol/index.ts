import axios from "axios";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { getEnv } from "../../helpers/env";
import { METRIC } from "../../helpers/metrics";

// SPL stake pool SAVEY1fVMBeRVo9V9rgEz8ENTvHreftd3QgpAKBDFV4 (saveSOL), verified on-chain 2026-09-05:
//   epoch fee 0%, SOL/stake deposit fee 0%, SOL/stake withdrawal fee 0.1%.
// The pool takes no cut of staking rewards, so all rewards go to saveSOL holders and the only
// protocol revenue is the 0.1% withdrawal fee, paid in saveSOL into the manager fee account.
const STAKE_POOL = "SAVEY1fVMBeRVo9V9rgEz8ENTvHreftd3QgpAKBDFV4";
const STAKE_POOL_RESERVE_ACCOUNT = "FL2AsvZPTW33QdmBgQx15ZdtaSbmuwY3oBCJMj63u9W1";
const STAKE_POOL_WITHDRAW_AUTHORITY = "9yWcz4S27nXKpsVmWqaimphCUnFo441JUvwkzmvRWys3";
const LST_FEE_TOKEN_ACCOUNT = "5VyLWq6nGg8mkAsHUwn6KqnaTni6hFZHb6dGiV7dCtGz";
const LST_MINT = "SAVEDpx3nFNdzG3ymJfShYnrBuYy7LtQEABZQ3qtTFt";
const STAKE_FEE_SHARE = 0;

// saveSOL has no price feed (not on coingecko, not in coins.llama.fi), so withdrawal fees are
// converted to SOL with the pool exchange rate total_lamports / pool_token_supply read from the
// stake pool account. The rate is the current one, not the historical one, so refills of old days
// overstate the fee slightly (the rate grows with staking yield, roughly 7% a year). The amounts
// involved are sub-dollar per withdrawal, so the error is immaterial.
async function getSaveSolExchangeRate(): Promise<number> {
  const res = await axios.post(getEnv("SOLANA_RPC"), {
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [STAKE_POOL, { encoding: "base64" }],
  });
  const data = Buffer.from(res.data.result.value.data[0], "base64");
  // StakePool layout: total_lamports u64 at offset 258, pool_token_supply u64 at offset 266
  const totalLamports = Number(data.readBigUInt64LE(258));
  const poolTokenSupply = Number(data.readBigUInt64LE(266));
  if (!poolTokenSupply) return 1;
  return totalLamports / poolTokenSupply;
}

const fetch = async (options: FetchOptions) => {
  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT,
    // The manager has deposited SOL straight into the fee account (DepositSol mints saveSOL to it,
    // 3167 saveSOL on 2026-08-13). With a 0% epoch fee nothing legitimate is ever minted to this
    // account, so every mint is excluded from revenue.
    exclude_mints_filter: "AND action!='mint'",
  });

  const [results, exchangeRate] = await Promise.all([
    queryDuneSql(options, query),
    getSaveSolExchangeRate(),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === "dailyFees") {
      dailyFees.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
      dailyRevenue.addCGToken("solana", (row.amount || 0) * STAKE_FEE_SHARE, METRIC.STAKING_REWARDS);
      dailySupplySideRevenue.addCGToken("solana", (row.amount || 0) * (1 - STAKE_FEE_SHARE), METRIC.STAKING_REWARDS);
    } else if (row.metric_type === "dailyRevenue") {
      const feesInSol = (row.amount || 0) * exchangeRate;
      dailyFees.addCGToken("solana", feesInSol, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyRevenue.addCGToken("solana", feesInSol, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Staking rewards from staked SOL and withdrawal fees on save staked solana",
  Revenue: "0.1% withdrawal fee collected by the stake pool fee account. The pool charges no epoch fee.",
  ProtocolRevenue: "All revenue goes to the protocol.",
  SupplySideRevenue: "All SOL staking rewards go to stakers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-03-31",
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Save.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee, paid in saveSOL and converted to SOL at the pool exchange rate.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by the stake pool fee account.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by the stake pool fee account.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "100% of the staking rewards are distributed to saveSOL holders.",
    },
  },
};

export default adapter;
