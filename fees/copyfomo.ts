import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
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
  return queryDuneSql(options, withPartition(FEES_SQL, options));
};

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    if (DUNE_TO_CHAIN[row.chain] !== options.chain) continue;
    // gross: everything that reached the treasury (service fee + gas billed to the user)
    dailyFees.addUSDValue(Number(row.fees_usd) || 0);
    // what leaves the treasury: referral rewards to users + the gas the bundler paid to the
    // network for those users' operations (the user's gas leg, passed through to validators)
    dailySupplySideRevenue.addUSDValue((Number(row.referral_usd) || 0) + (Number(row.gas_usd) || 0));
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
  Fees: "Everything traders pay copyfomo on every copied buy and sell: the service fee (2% of the trade) plus the gas billed back to them. Measured on-chain as every stablecoin transfer into the copyfomo treasury (USDC on Base and Solana, USDT/USDC on BNB Chain, USDG on Robinhood Chain). Fees are collected in a separate transaction from the trade, so the day of collection is used.",
  UserFees: "Same as Fees: everything is paid by the trader.",
  SupplySideRevenue: "What leaves the treasury: referral rewards sent back to copyfomo user wallets, plus the gas the copyfomo bundler wallets paid to the ERC-4337 EntryPoint (network validators) for those users' operations, priced with the daily WETH / WBNB price.",
  Revenue: "Fees minus SupplySideRevenue: the service fee plus the margin on gas. Same definition as the 'protocol fees, after gas' figure published on copyfomo.com/data.",
  ProtocolRevenue: "All revenue goes to the treasury.",
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
};

export default adapter;
