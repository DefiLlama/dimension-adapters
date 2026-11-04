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
    trade_fees_v1?: number;
    trade_fees_v2?: number;
    borrow_fees_v1?: number;
    borrow_fees_v2?: number;
  };
}

// Labels reused across every dimension so the breakdown is consistent.
const TRADING_FEES_LABEL = "Trading Fees";
const BORROW_FEES_LABEL = "Borrow Fees";

// Rise v1 markets — of every fee collected:
//   25%   → creator + floor (on-chain, supply-side)
//   75%   → rise team wallet (= revenue)
//     ├─ 75% × 75% = 56.25% → rise treasury (protocolRevenue)
//     └─ 75% × 25% = 18.75% → off-chain ops (not surfaced) -> Not handling this as we dont have metric for OE
const V1_REVENUE_RATIO = 0.75;
const V1_SUPPLY_SIDE_REVENUE_RATIO = 0.25;

// Rise v2 markets — every fee is split on-chain 50% team wallet / 50% creator.
const V2_REVENUE_RATIO = 0.5;
const V2_SUPPLY_SIDE_REVENUE_RATIO = 0.5;

const fetch = async (options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: FeesResponse = await fetchURL(url);

  if (!res || !res.breakdown) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  const b = res.breakdown;
  const tradeFees = Number(b.trade_fees) || 0;
  const borrowFees = Number(b.borrow_fees) || 0;
  const tradeFeesV2 = Number(b.trade_fees_v2) || 0;
  const borrowFeesV2 = Number(b.borrow_fees_v2) || 0;
  const tradeFeesV1 = b.trade_fees_v1 !== undefined ? Number(b.trade_fees_v1) || 0 : tradeFees - tradeFeesV2;
  const borrowFeesV1 = b.borrow_fees_v1 !== undefined ? Number(b.borrow_fees_v1) || 0 : borrowFees - borrowFeesV2;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(tradeFeesV1 + tradeFeesV2, TRADING_FEES_LABEL);
  dailyFees.addUSDValue(borrowFeesV1 + borrowFeesV2, BORROW_FEES_LABEL);

  dailyRevenue.addUSDValue(
    tradeFeesV1 * V1_REVENUE_RATIO + tradeFeesV2 * V2_REVENUE_RATIO,
    "Trading fees to team wallet",
  );
  dailyRevenue.addUSDValue(
    borrowFeesV1 * V1_REVENUE_RATIO + borrowFeesV2 * V2_REVENUE_RATIO,
    "Borrow fees to team wallet",
  );

  dailySupplySideRevenue.addUSDValue(
    tradeFeesV1 * V1_SUPPLY_SIDE_REVENUE_RATIO + tradeFeesV2 * V2_SUPPLY_SIDE_REVENUE_RATIO,
    "Trading fees to creator and floor reserve",
  );
  dailySupplySideRevenue.addUSDValue(
    borrowFeesV1 * V1_SUPPLY_SIDE_REVENUE_RATIO + borrowFeesV2 * V2_SUPPLY_SIDE_REVENUE_RATIO,
    "Borrow fees to creator and floor reserve",
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1.25% on every buy/sell trade and 3% on every borrow (gross principal), on Rise v1 and v2 markets. Includes both bonding-curve trading fees and lending fees.",
  Revenue:
    "Fees collected by the rise team wallet: 75% of v1 fees and 50% of v2 fees (on-chain protocol share, before any internal split).",
  ProtocolRevenue:
    "Fees collected by the rise team wallet: 75% of v1 fees and 50% of v2 fees (on-chain protocol share, before any internal split).",
  SupplySideRevenue:
    "Fees paid to creators: 25% of v1 fees (split per-market between the creator and the floor reserve) and 50% of v2 fees (to the creator).",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES_LABEL]: "1.25% of trade notional on buy/sell/create transactions (v1 and v2).",
    [BORROW_FEES_LABEL]: "3% of gross borrow principal taken at borrow time (v1 and v2).",
  },
  Revenue: {
    ["Trading fees to team wallet"]: "75% of v1 and 50% of v2 trade fees flowing to the rise team wallet.",
    ["Borrow fees to team wallet"]: "75% of v1 and 50% of v2 borrow fees flowing to the rise team wallet.",
  },
  ProtocolRevenue: {
    ["Trading fees to team wallet"]: "75% of v1 and 50% of v2 trade fees ending up in the rise treasury.",
    ["Borrow fees to team wallet"]: "75% of v1 and 50% of v2 borrow fees ending up in the rise treasury.",
  },
  SupplySideRevenue: {
    ["Trading fees to creator and floor reserve"]: "25% of v1 trade fees (creator + floor reserve) and 50% of v2 trade fees (creator).",
    ["Borrow fees to creator and floor reserve"]: "25% of v1 borrow fees (creator + floor reserve) and 50% of v2 borrow fees (creator).",
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
