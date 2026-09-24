import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { FEES_SQL, withPartition } from "../helpers/queries/copyfomo";

// copyfomo -- Telegram copy-trading bot (https://www.copyfomo.com, https://x.com/copyfomo).
// Users deposit stablecoins into their own smart account / Solana wallet and copy
// leaders' trades. The bot charges a service fee on every buy and sell (flat + bps,
// see https://www.copyfomo.com/data), collected as a stablecoin transfer to the treasury.
// copyfomo also earns the creator fees of its token $COPY (2.7% of every trade of the COPY/COIN
// pool, Pons launchpad on Robinhood Chain) and spends part of them buying back and burning $COPY.

// Dune chain ids -> DefiLlama chain ids
const DUNE_TO_CHAIN: Record<string, string> = {
  base: CHAIN.BASE,
  bnb: CHAIN.BSC,
  robinhood: CHAIN.ROBINHOOD,
  solana: CHAIN.SOLANA,
};

const prefetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  return queryDuneSql(options, withPartition(FEES_SQL, options));
};

const TREASURY_INFLOW = "Treasury inflow";
const COPY_CREATOR_FEES = "$COPY creator fees";
const REFERRAL_REWARDS = "Referral rewards";
const BUNDLER_GAS_COST = "Bundler gas cost";
const BUYBACK_AND_BURN = "Buyback & burn";

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyUserFees = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  for (const row of rows) {
    if (DUNE_TO_CHAIN[row.chain] !== options.chain) continue;
    // gross: everything that reached the treasury (service fee + gas billed to the user,
    // paid together in one transfer and not separable on-chain)
    dailyUserFees.addUSDValue(Number(row.fees_usd) || 0, TREASURY_INFLOW);
    // $COPY creator fees (robinhood only): paid by $COPY traders through the Pons hook on every
    // swap, accrued for copyfomo and claimed later from the launchpad's fee escrow
    dailyFees.addUSDValue(Number(row.creator_usd) || 0, COPY_CREATOR_FEES);
    dailySupplySideRevenue.addUSDValue(Number(row.referral_usd) || 0, REFERRAL_REWARDS);
    dailySupplySideRevenue.addUSDValue(Number(row.gas_usd) || 0, BUNDLER_GAS_COST);
    // part of the creator fees is spent buying $COPY that is burned: holders' share
    dailyHoldersRevenue.addUSDValue(Number(row.buyback_usd) || 0, BUYBACK_AND_BURN);
  }
  dailyFees.add(dailyUserFees);
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue);
  let dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.subtract(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Everything traders pay copyfomo on every copied buy and sell (a 2% service fee plus the gas copyfomo fronts for them, billed back as one stablecoin transfer to the copyfomo treasury, counted on the day the fee is collected), plus the creator fees of the copyfomo token $COPY: the Pons launchpad hook takes 3% of every swap of the COPY/COIN pool on Robinhood Chain, of which 2.7% goes to the creator (1% hook fee, 70% to the creator, plus a 2% creator tax). Counted on the day of the trade, valued at the hourly COIN price. The fees are swept into COIN by Pons and claimed by copyfomo in batches later; the claims are not what is counted.",
  UserFees: "The part paid by copyfomo users: service fee plus gas billed back. Excludes the $COPY creator fees, which are paid by $COPY traders.",
  SupplySideRevenue: "Referral rewards paid back to copyfomo users, plus the actual on-chain gas cost copyfomo pays on their behalf.",
  Revenue: "Fees minus SupplySideRevenue: the service fee plus copyfomo's margin on gas (the 'protocol fees, after gas' figure on copyfomo.com/data) plus the $COPY creator fees (the 'token fees' figure on the same page).",
  HoldersRevenue: "Buyback & burn of $COPY, funded by the creator fees: what the copyfomo creator wallets pay (COIN or USDG) in every transaction where they buy $COPY from the pool and burn $COPY in the same transaction (the buyback account buys and burns in one user operation). Counted on the day of the buy, which follows the trades that generated the fees. A holder cashback leg (USDG distributed to $COPY holders) is planned and will be added when it goes live.",
  ProtocolRevenue: "Revenue minus HoldersRevenue: service revenue and the creator fees kept by copyfomo.",
};

const breakdownMethodology = {
  Fees: {
    [TREASURY_INFLOW]: "Every stablecoin transfer into the copyfomo treasury. The service fee and the gas billed back to the trader arrive together in one transfer and cannot be split on-chain.",
    [COPY_CREATOR_FEES]: "2.7% of the COIN leg of every swap of the COPY/COIN Uniswap v4 pool on Robinhood Chain (PoolManager Swap events of the pool), valued at the hourly COIN price on Dune. Rate from the hook's launch config: 1% hook fee with 70% to the creator, plus a 2% creator tax.",
  },
  UserFees: {
    [TREASURY_INFLOW]: "Same as the Fees component: everything copyfomo users pay.",
  },
  SupplySideRevenue: {
    [REFERRAL_REWARDS]: "Stablecoin transfers from the treasury back to identified copyfomo user wallets.",
    [BUNDLER_GAS_COST]: "Gas the copyfomo bundler wallets paid to the ERC-4337 EntryPoint for users' operations, priced with the daily WETH / WBNB price.",
  },
  HoldersRevenue: {
    [BUYBACK_AND_BURN]: "COIN and USDG sent by the copyfomo creator wallets in every transaction that swaps on the COPY/COIN pool, delivers $COPY to them and burns $COPY from them (Transfer to the zero address) in that same transaction, since 2026-09-11 when the buyback programme started. The three manual buys of 2026-09-11, burned the next day in one transaction (hash in the query helper), are listed explicitly.",
  },
  Revenue: {
    [TREASURY_INFLOW]: "Same as the Fees component: gross service fees before the supply-side deductions.",
    [COPY_CREATOR_FEES]: "Same as the Fees component: creator fees have no supply-side share.",
    [REFERRAL_REWARDS]: "Same as the SupplySideRevenue component, subtracted from gross fees.",
    [BUNDLER_GAS_COST]: "Same as the SupplySideRevenue component, subtracted from gross fees.",
  },
  ProtocolRevenue: {
    [TREASURY_INFLOW]: "Same as the Revenue component.",
    [COPY_CREATOR_FEES]: "Same as the Revenue component.",
    [REFERRAL_REWARDS]: "Same as the Revenue component.",
    [BUNDLER_GAS_COST]: "Same as the Revenue component.",
    [BUYBACK_AND_BURN]: "Same as the HoldersRevenue component, subtracted from Revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  chains: [CHAIN.BASE, CHAIN.BSC, CHAIN.ROBINHOOD, CHAIN.SOLANA],
  start: "2026-08-26",
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // buybacks can exceed revenue on some days due to cumulative accrual
};

export default adapter;
