import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ENDPOINT = "https://public.rise.rich/public/defillama/fees";

interface FeesResponse {
  totalFeesUsd: number;
  totalRevenueUsd: number;
  totalProtocolRevenueUsd: number;
  totalSupplySideRevenueUsd: number;
  breakdown: {
    trade_fees: number;
    borrow_fees: number;
  };
}

// Labels reused across every dimension so the breakdown is consistent.
const TRADING_FEES_LABEL = "Trading Fees";
const BORROW_FEES_LABEL = "Borrow Fees";

// Of every fee collected:
//   25%   → creator + floor (on-chain, supply-side)
//   75%   → rise team wallet (= revenue)
//     ├─ 75% × 75% = 56.25% → rise treasury (protocolRevenue)
//     └─ 75% × 25% = 18.75% → off-chain ops (not surfaced) -> Not handling this as we dont have metric for OE
const REVENUE_RATIO = 0.75;
const SUPPLY_SIDE_REVENUE_RATIO = 0.25;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: FeesResponse = await fetchURL(url);

  if (!res || !res.breakdown) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  const tradeFees = Number(res.breakdown.trade_fees) || 0;
  const borrowFees = Number(res.breakdown.borrow_fees) || 0;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(tradeFees, TRADING_FEES_LABEL);
  dailyFees.addUSDValue(borrowFees, BORROW_FEES_LABEL);

  dailyRevenue.addUSDValue(tradeFees * REVENUE_RATIO, "Trading fees to team wallet");
  dailyRevenue.addUSDValue(borrowFees * REVENUE_RATIO, "Borrow fees to team wallet");

  dailySupplySideRevenue.addUSDValue(tradeFees * SUPPLY_SIDE_REVENUE_RATIO, "Trading fees to creator and floor reserve");
  dailySupplySideRevenue.addUSDValue(borrowFees * SUPPLY_SIDE_REVENUE_RATIO, "Borrow fees to creator and floor reserve");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1.25% on every buy/sell trade and 3% on every borrow (gross principal). Includes both bonding-curve trading fees and lending fees.",
  Revenue:
    "75% of total fees collected by the rise team wallet (on-chain protocol share, before any internal split).",
  ProtocolRevenue:
    "75% of total fees collected by the rise team wallet (on-chain protocol share, before any internal split).",
  SupplySideRevenue:
    "25% of total fees paid to creators and the per-market floor reserve (split per-market by creator_fee_percent).",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES_LABEL]: "1.25% of trade notional on buy/sell/create transactions.",
    [BORROW_FEES_LABEL]: "3% of gross borrow principal taken at borrow time.",
  },
  Revenue: {
    ["Trading fees to team wallet"]: "75% of trade fees flowing to the rise team wallet.",
    ["Borrow fees to team wallet"]: "75% of borrow fees flowing to the rise team wallet.",
  },
  ProtocolRevenue: {
    ["Trading fees to team wallet"]: "75% of trade fees ending up in the rise treasury.",
    ["Borrow fees to team wallet"]: "75% of borrow fees ending up in the rise treasury.",
  },
  SupplySideRevenue: {
    ["Trading fees to creator and floor reserve"]: "25% of trade fees split between the market creator and the market's floor reserve.",
    ["Borrow fees to creator and floor reserve"]: "25% of borrow fees split between the market creator and the market's floor reserve.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  start: "2026-04-02",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
