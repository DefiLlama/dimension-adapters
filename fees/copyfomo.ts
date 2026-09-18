import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { FEES_SQL, withPartition } from "../helpers/queries/copyfomo";

// copyfomo -- Telegram copy-trading bot (https://www.copyfomo.com, https://x.com/copyfomo).
// Users deposit stablecoins into their own smart account / Solana wallet and copy
// leaders' trades. The bot charges a service fee on every buy and sell (flat + bps,
// see https://www.copyfomo.com/data), collected as a stablecoin transfer to the treasury.

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
const REFERRAL_REWARDS = "Referral rewards";
const BUNDLER_GAS_COST = "Bundler gas cost";

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    if (DUNE_TO_CHAIN[row.chain] !== options.chain) continue;
    // gross: everything that reached the treasury (service fee + gas billed to the user,
    // paid together in one transfer and not separable on-chain)
    dailyFees.addUSDValue(Number(row.fees_usd) || 0, TREASURY_INFLOW);
    dailySupplySideRevenue.addUSDValue(Number(row.referral_usd) || 0, REFERRAL_REWARDS);
    dailySupplySideRevenue.addUSDValue(Number(row.gas_usd) || 0, BUNDLER_GAS_COST);
  }
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue);
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Everything traders pay copyfomo on every copied buy and sell: a 2% service fee plus the gas copyfomo fronts for them, billed back as one stablecoin transfer to the copyfomo treasury. Counted on the day the fee is collected, which is a separate transaction from the trade itself.",
  SupplySideRevenue: "Referral rewards paid back to copyfomo users, plus the actual on-chain gas cost copyfomo pays on their behalf.",
  Revenue: "Fees minus SupplySideRevenue: the service fee plus copyfomo's margin on gas. Matches the 'protocol fees, after gas' figure on copyfomo.com/data.",
  ProtocolRevenue: "All revenue goes to the treasury.",
};

const breakdownMethodology = {
  Fees: {
    [TREASURY_INFLOW]: "Every stablecoin transfer into the copyfomo treasury. The service fee and the gas billed back to the trader arrive together in one transfer and cannot be split on-chain.",
  },
  SupplySideRevenue: {
    [REFERRAL_REWARDS]: "Stablecoin transfers from the treasury back to identified copyfomo user wallets.",
    [BUNDLER_GAS_COST]: "Gas the copyfomo bundler wallets paid to the ERC-4337 EntryPoint for users' operations, priced with the daily WETH / WBNB price.",
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
};

export default adapter;
