import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { FEES_SQL, withPartition } from "../helpers/queries/copypump";

// copypump -- Telegram copy-trading bot on pump.fun (https://www.copypumpfun.com, https://x.com/copypumpfun).
// Users deposit USDC into their own Solana wallet and copy a public pump.fun wallet's buys and
// sells. The bot charges a service fee on every copied buy and sell, collected as a USDC transfer
// to the copypump treasury, and pays the gas of every copied trade from its own fee payer.
// Solana only; no token, no referral programme.
// Same definitions as https://www.copypumpfun.com/data and https://dune.com/polycool/copypumpfun.

const prefetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  return queryDuneSql(options, withPartition(FEES_SQL, options));
};

const SERVICE_FEE = "Service fee";
const FEE_PAYER_COST = "Fee payer cost";

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  for (const row of rows) {
    const fees = Number(row.fees_usd) || 0;
    const gas = Number(row.gas_usd) || 0;
    dailyFees.addUSDValue(fees, SERVICE_FEE);
    dailySupplySideRevenue.addUSDValue(gas, FEE_PAYER_COST);
    // net revenue under the fee's own label: the cost is subtracted from the service fee,
    // never emitted as a negative "Fee payer cost" line
    dailyRevenue.addUSDValue(fees - gas, SERVICE_FEE);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "The service fee copypump charges on every copied buy and sell, collected as a USDC transfer to the copypump treasury and counted on the day it is collected (the collector batches fees per user, so a fee can land the day after its trade).",
  UserFees: "The service fees copypump charges on every copied buy and sell, collected as a USDC transfer to the copypump treasury and counted on the day it is collected (the collector batches fees per user, so a fee can land the day after its trade).",
  SupplySideRevenue: "The cost copypump pays on users' behalf: the SOL the copypump fee payer loses co-signing every copied trade (signature fee, priority fee, rent of the token accounts the route creates), net of the rent it recovers when the emptied accounts are closed back to it. Priced at the daily SOL price.",
  Revenue: "Fees minus the fee payer cost: what copypump keeps. The 'app revenue, after gas' figure on copypumpfun.com/data.",
  ProtocolRevenue: "Fees minus the fee payer cost: what copypump keeps.",
};

const breakdownMethodology = {
  Fees: {
    [SERVICE_FEE]: "Every USDC transfer into the copypump treasury on Solana.",
  },
  UserFees: {
    [SERVICE_FEE]: "Every USDC transfer into the copypump treasury on Solana.",
  },
  SupplySideRevenue: {
    [FEE_PAYER_COST]: "SOL the fee payer lost in the transactions it signed: fees and the rent of the token accounts it creates, net of the rent it gets back when copypump closes the emptied accounts to it (since 2026-10-13). Its top-ups from the treasury are co-signed by the treasury and excluded; failed transactions are included since their fee is paid. Priced with the daily SOL price.",
  },
  Revenue: {
    [SERVICE_FEE]: "The service fee net of the fee payer cost of the same day: what copypump keeps.",
  },
  ProtocolRevenue: {
    [SERVICE_FEE]: "The service fee net of the fee payer cost of the same day: what copypump keeps.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-16",
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  // the fee payer's cost is paid on the day of the trade while the service fee can be collected the
  // day after, so a quiet day after a busy one can show a cost above its fees; and the rent it
  // advanced comes back on later days (accounts closed back to it), so the cost itself can be
  // negative on a day
  allowNegativeValue: true,
};

export default adapter;
