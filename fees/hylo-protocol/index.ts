import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Hylo Protocol — protocol revenue from the public API.
// Docs: https://api.hylo.so/docs
// GET /v1/protocol/fees returns the indexer's daily fee rollup, broken down by
// token and by operation. Every row is a fee that accrued to the protocol
// (mint/redeem/swap fees, stability-pool withdrawal fees, and the protocol's
// share of harvested yield and borrow rate). Amounts are exact decimal strings
// and come with a USD valuation at the time of the event.
const FEES_URL = "https://api.hylo.so/v1/protocol/fees";

interface FeeRow {
  operation: string;
  token: string;
  market?: string;
  fee: string;
  usd: string;
}

interface FeeDay {
  date: string; // UTC day, YYYY-MM-DD
  byToken: { token: string; fee: string; usd: string }[];
  byOperation: FeeRow[];
}

const OPERATION_LABELS: Record<string, string> = {
  MintStablecoin: "Mint/Redeem Fees",
  RedeemStablecoin: "Mint/Redeem Fees",
  MintLevercoin: "Mint/Redeem Fees",
  RedeemLevercoin: "Mint/Redeem Fees",
  MintLevercoinExo: "Mint/Redeem Fees",
  RedeemLevercoinExo: "Mint/Redeem Fees",
  SwapStableToLever: "Swap Fees",
  SwapLeverToStable: "Swap Fees",
  SwapStableToLeverExo: "Swap Fees",
  SwapLeverToStableExo: "Swap Fees",
  SwapLst: "Swap Fees",
  UserWithdraw: "Stability Pool Withdrawal Fees",
  HarvestYield: "Yield Fees",
  HarvestBorrowRate: "Yield Fees",
};

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;
  const res = await httpGet(`${FEES_URL}?from=${date}&to=${date}`);
  const day: FeeDay | undefined = (res?.daily || []).find((d: FeeDay) => d.date === date);
  if (!day) throw new Error(`Hylo API returned no fee data for ${date}`);

  const dailyFees = options.createBalances();
  for (const row of day.byOperation) {
    const usd = Number(row.usd);
    if (!Number.isFinite(usd)) throw new Error(`Hylo API returned a bad usd value for ${date}: ${JSON.stringify(row)}`);
    dailyFees.addUSDValue(usd, OPERATION_LABELS[row.operation] ?? "Other Fees");
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Protocol fees collected from users, from the Hylo public API (api.hylo.so/v1/protocol/fees): mint/redeem fees, hyUSD/xSOL (and exo pair) swap fees, stability pool withdrawal fees, and the protocol's share of harvested LST yield and borrow rate.",
  Revenue: "All collected fees accrue to the protocol.",
  ProtocolRevenue: "All collected fees accrue to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    "Mint/Redeem Fees": "Fees on minting and redeeming hyUSD and levercoins (xSOL, xBTC, ...) against the collateral vaults.",
    "Swap Fees": "Fees on swaps between hyUSD and levercoins, and on LST swaps.",
    "Stability Pool Withdrawal Fees": "Fees on withdrawals from the hyUSD stability pool.",
    "Yield Fees": "Protocol share of harvested LST yield and exo pair borrow rate.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-04-01",
  chains: [CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
};

export default adapter;
