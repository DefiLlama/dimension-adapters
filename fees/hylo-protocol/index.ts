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
// GET /v1/protocol/digest returns the daily activity digest; per market it
// carries `yieldToPool`, the yield (in hyUSD) paid out to stability pool
// depositors. That is supply-side revenue, not protocol revenue.
const FEES_URL = "https://api.hylo.so/v1/protocol/fees";
const DIGEST_URL = "https://api.hylo.so/v1/protocol/digest";

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

interface DigestDay {
  date: string; // UTC day, YYYY-MM-DD
  markets: { market: string; yieldToPool?: { token: string; amount: string; usd: string } }[];
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
  const [feesRes, digestRes] = await Promise.all([
    httpGet(`${FEES_URL}?from=${date}&to=${date}`),
    httpGet(`${DIGEST_URL}?from=${date}&to=${date}`),
  ]);
  const feeDay: FeeDay | undefined = (feesRes?.daily || []).find((d: FeeDay) => d.date === date);
  if (!feeDay) throw new Error(`Hylo API returned no fee data for ${date}`);
  const digestDay: DigestDay | undefined = (digestRes?.daily || []).find((d: DigestDay) => d.date === date);
  if (!digestDay) throw new Error(`Hylo API returned no digest data for ${date}`);

  const dailyRevenue = options.createBalances();
  for (const row of feeDay.byOperation) {
    const usd = Number(row.usd);
    if (!Number.isFinite(usd)) throw new Error(`Hylo API returned a bad usd value for ${date}: ${JSON.stringify(row)}`);
    dailyRevenue.addUSDValue(usd, OPERATION_LABELS[row.operation] ?? "Other Fees");
  }

  const dailySupplySideRevenue = options.createBalances();
  for (const market of digestDay.markets || []) {
    if (!market.yieldToPool) continue;
    const usd = Number(market.yieldToPool.usd);
    if (!Number.isFinite(usd)) throw new Error(`Hylo API returned a bad yieldToPool value for ${date}: ${JSON.stringify(market)}`);
    dailySupplySideRevenue.addUSDValue(usd, "Stability Pool Yield");
  }

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Protocol fees collected from users (api.hylo.so/v1/protocol/fees) plus the yield paid to stability pool depositors (api.hylo.so/v1/protocol/digest).",
  Revenue: "Protocol fees: mint/redeem fees, hyUSD/levercoin swap fees, stability pool withdrawal fees, and the protocol's share of harvested LST yield and borrow rate.",
  ProtocolRevenue: "Same as Revenue; all protocol fees accrue to the protocol.",
  SupplySideRevenue: "Harvested LST yield and borrow rate (in hyUSD) distributed to stability pool depositors.",
};

const breakdownMethodology = {
  Fees: {
    "Mint/Redeem Fees": "Fees on minting and redeeming hyUSD and levercoins (xSOL, xBTC, ...) against the collateral vaults.",
    "Swap Fees": "Fees on swaps between hyUSD and levercoins, and on LST swaps.",
    "Stability Pool Withdrawal Fees": "Fees on withdrawals from the hyUSD stability pool.",
    "Yield Fees": "Protocol share of harvested LST yield and exo pair borrow rate.",
    "Stability Pool Yield": "Harvested LST yield and borrow rate paid out to stability pool depositors.",
  },
  SupplySideRevenue: {
    "Stability Pool Yield": "Harvested LST yield and borrow rate paid out to stability pool depositors.",
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
