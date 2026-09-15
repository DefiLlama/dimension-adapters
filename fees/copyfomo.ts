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
    // service fees = what reached the treasury minus the gas the bot paid for the user
    dailyFees.addUSDValue((Number(row.fees_usd) || 0) - (Number(row.gas_usd) || 0));
    dailySupplySideRevenue.addUSDValue(Number(row.referral_usd) || 0);
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
  Fees: "Service fees paid by traders on every copied buy and sell. Measured on-chain as every stablecoin transfer into the copyfomo treasury (USDC on Base and Solana, USDT/USDC on BNB Chain, USDG on Robinhood Chain), minus the gas the copyfomo bundler wallets paid to the ERC-4337 EntryPoint for those users' operations. Fees are collected in a separate transaction from the trade, so the day of collection is used. Same definition as the 'protocol fees, after gas' figure published on copyfomo.com/data.",
  UserFees: "Same as Fees: everything is paid by the trader.",
  SupplySideRevenue: "Referral rewards: stablecoins sent from the treasury back to copyfomo user wallets (referrers).",
  Revenue: "Fees minus referral rewards.",
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
