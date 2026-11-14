import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";
import { decodeStakePool, getAccountBuffer } from "../../helpers/solana";

// SPL stake pool behind dzSOL, verified on-chain 2026-11-14: pool_mint is LST_MINT, reserve_stake is
// STAKE_POOL_RESERVE_ACCOUNT, manager_fee_account is LST_FEE_TOKEN_ACCOUNT, epoch fee 6/100.
const STAKE_POOL = "3fV1sdGeXaNEZj6EPDTpub82pYxcRXwt2oie6jkSzeWi";
// The stake pool program takes the epoch fee out of every lamport the pool earns (staking rewards and Jito MEV tips) and
// mints it as dzSOL to the manager fee account; the rest stays in the pool for dzSOL holders.
// Set to 6/100 by SetFee 29o5RYPAZdd9ZBjGvMvDhUSAqDdnuPnSQZd5sh8fAjkFMeoyxnSuYHFnFKBj94oa87v75Ag4HUY4hts4FwjJSNdp
// (2025-07-14, before start). The manager's full history since pool creation (2025-06-17) has no other epoch SetFee.
const EPOCH_FEE = 0.06;
const STAKE_POOL_RESERVE_ACCOUNT = "FFtERWBSCkScg8spA2mNB9zN5SdH16NqQywXw3bbB1aJ";
const STAKE_POOL_WITHDRAW_AUTHORITY = "4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt";
const LST_FEE_TOKEN_ACCOUNT = "GhN6PpyP6Ln4ycWcyvqsNcowLfYjpUcA9uWKAcFBjj2D";
const LST_MINT = "Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn"; // dzSOL

// Revenue (epoch fee + withdrawal fees) and the user-fee part of fees are paid in dzSOL into the manager fee account.
// How those dzSOL amounts are valued:
// - days up to 2025-10-06: 1:1 as SOL
// - 2025-10-07 to 2026-10-18: coingecko doublezero-staked-sol price
// - from 2026-10-19: the coingecko feed stopped updating (last_updated 2026-10-19T09:00:52Z) and coins.llama.fi has
//   no dzSOL price from 2026-10-29, so dzSOL is converted to SOL with the pool exchange rate
//   total_lamports / pool_token_supply, like save-staked-sol. The rate is the current one, so refills overstate old
//   days slightly (it grows with staking yield, ~7% a year).
const DZSOL_CG_PRICE_AFTER = 1759735276; // 2025-10-06
const DZSOL_POOL_RATE_FROM = 1792368000; // 2026-10-19

async function getDzSolExchangeRate(): Promise<number> {
  const data = await getAccountBuffer({ account: STAKE_POOL });
  if (!data) throw new Error(`doublezero-staked-sol: stake pool account ${STAKE_POOL} not found`);
  // StakePool layout: epoch_fee { denominator u64 at 330, numerator u64 at 338 }
  const epochFee = Number(data.readBigUInt64LE(338)) / Number(data.readBigUInt64LE(330));
  if (epochFee !== EPOCH_FEE) throw new Error(`doublezero-staked-sol: epoch fee is now ${epochFee}, add a dated switch for EPOCH_FEE`);
  const { totalLamports, poolTokenSupply } = decodeStakePool(data);
  if (!Number(poolTokenSupply)) throw new Error("doublezero-staked-sol: stake pool has no supply");
  return Number(totalLamports) / Number(poolTokenSupply);
}

const fetch = async (options: FetchOptions) => {
  const usePoolRate = options.startTimestamp >= DZSOL_POOL_RATE_FROM;
  const dzSolPricedAs = usePoolRate || options.startTimestamp <= DZSOL_CG_PRICE_AFTER ? "solana" : "doublezero-staked-sol";

  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT,
    exclude_mints_filter: "",
  });

  const [results, dzSolToSol] = await Promise.all([
    queryDuneSql(options, query),
    usePoolRate ? getDzSolExchangeRate() : 1,
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === "dailyFees" || row.metric_type === "dailyMevRewards") {
      const label = row.metric_type === "dailyMevRewards" ? METRIC.MEV_REWARDS : METRIC.STAKING_REWARDS;
      dailyFees.addCGToken("solana", row.amount || 0, label);
      dailySupplySideRevenue.addCGToken("solana", (row.amount || 0) * (1 - EPOCH_FEE), label);
    } else if (row.metric_type === "dailyRevenue") {
      dailyRevenue.addCGToken(dzSolPricedAs, (row.amount || 0) * dzSolToSol);
    } else if (row.metric_type === "dailyUserFees") {
      dailyFees.addCGToken(dzSolPricedAs, (row.amount || 0) * dzSolToSol);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // Dune query, runs once per day
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-07-25",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Staking rewards from staked SOL on doublezero staked solana, plus the withdrawal fees users pay on their principal (paid in dzSOL, valued at the stake pool's SOL exchange rate from 2026-10-19). Also counts the Jito MEV tips claimed by the pool's stake accounts",
    Revenue: "Includes withdrawal fees and management fees collected by fee collector, in dzSOL valued at the stake pool's SOL exchange rate from 2026-10-19",
    ProtocolRevenue: "Revenue going to treasury/team",
    SupplySideRevenue: "94% of the staking rewards and Jito MEV tips earned by the pool's stake, which stay in the pool and accrue to dzSOL holders; the pool keeps a 6% epoch fee",
    HoldersRevenue: "No revenue share to 2Z token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL",
      [METRIC.MEV_REWARDS]: "Jito MEV tips claimed by the pool's stake accounts",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "94% of the staking rewards, which stay in the pool for dzSOL holders",
      [METRIC.MEV_REWARDS]: "94% of the Jito MEV tips claimed by the pool's stake accounts, which stay in the pool for dzSOL holders",
    },
  },
};

export default adapter;
