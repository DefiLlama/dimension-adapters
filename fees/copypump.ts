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
  UserFees: "Same as Fees: every fee is paid by a copypump user.",
  SupplySideRevenue: "The cost copypump pays on users' behalf: the SOL spent by the copypump fee payer, which co-signs every copied trade and pays its signature fee, priority fee and the rent of the token accounts the route creates. Priced at the daily SOL price.",
  Revenue: "Fees minus the fee payer cost: what copypump keeps. The 'app revenue, after gas' figure on copypumpfun.com/data.",
  ProtocolRevenue: "Same as Revenue: there is no token and no holder distribution, everything copypump keeps goes to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [SERVICE_FEE]: "Every USDC transfer into the copypump treasury on Solana.",
  },
  UserFees: {
    [SERVICE_FEE]: "Same as the Fees component.",
  },
  SupplySideRevenue: {
    [FEE_PAYER_COST]: "SOL that left the fee payer's account in the transactions it signed (fees and rent, net of rent returned in the same transaction). Transactions where its balance went up are its top-ups from the treasury and are excluded; failed transactions are included since their fee is paid. Priced with the daily SOL price.",
  },
  Revenue: {
    [SERVICE_FEE]: "The service fee net of the fee payer cost of the same day: what copypump keeps.",
  },
  ProtocolRevenue: {
    [SERVICE_FEE]: "Same as the Revenue component.",
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
  // the fee payer's cost is paid on the day of the trade while the service fee can be collected
  // the day after: a quiet day following a busy one can show a cost above its fees
  allowNegativeValue: true,
};

export default adapter;
