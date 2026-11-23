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
    trade_fees_v2_team?: number;
    trade_fees_v2_creator?: number;
    trade_fees_v2_floor?: number;
    borrow_fees_v2_team?: number;
    borrow_fees_v2_creator?: number;
    borrow_fees_v2_floor?: number;
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

// Rise v2 markets — the split is set per market on-chain (fees_team / fees_creator /
// fees_floor, in bps of the fee). The endpoint applies each market's own values and
// returns the resulting legs, so no v2 ratio is hardcoded here.

const fetch = async (options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: FeesResponse = await fetchURL(url);

  if (!res || !res.breakdown) {
    throw new Error(`No data found for date ${options.dateString}`);
  }

  const b = res.breakdown;
  const num = (x: unknown) => Math.max(Number(x) || 0, 0);
  const tradeFees = num(b.trade_fees);
  const borrowFees = num(b.borrow_fees);

  const v2TradeTeam = num(b.trade_fees_v2_team);
  const v2TradeSupply = num(b.trade_fees_v2_creator) + num(b.trade_fees_v2_floor);
  const v2BorrowTeam = num(b.borrow_fees_v2_team);
  const v2BorrowSupply = num(b.borrow_fees_v2_creator) + num(b.borrow_fees_v2_floor);

  const tradeFeesV2 = v2TradeTeam + v2TradeSupply;
  const borrowFeesV2 = v2BorrowTeam + v2BorrowSupply;
  if (tradeFeesV2 > tradeFees * 1.000001 || borrowFeesV2 > borrowFees * 1.000001) {
    throw new Error(`v2 fee legs exceed the totals for ${options.dateString}`);
  }
  const tradeFeesV1 = Math.max(tradeFees - tradeFeesV2, 0);
  const borrowFeesV1 = Math.max(borrowFees - borrowFeesV2, 0);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(tradeFees, TRADING_FEES_LABEL);
  dailyFees.addUSDValue(borrowFees, BORROW_FEES_LABEL);

  dailyRevenue.addUSDValue(
    tradeFeesV1 * V1_REVENUE_RATIO + v2TradeTeam,
    "Trading fees to team wallet",
  );
  dailyRevenue.addUSDValue(
    borrowFeesV1 * V1_REVENUE_RATIO + v2BorrowTeam,
    "Borrow fees to team wallet",
  );

  dailySupplySideRevenue.addUSDValue(
    tradeFeesV1 * V1_SUPPLY_SIDE_REVENUE_RATIO + v2TradeSupply,
    "Trading fees to creator and floor reserve",
  );
  dailySupplySideRevenue.addUSDValue(
    borrowFeesV1 * V1_SUPPLY_SIDE_REVENUE_RATIO + v2BorrowSupply,
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
    "Fees collected by the rise team wallet: 75% of v1 fees and, on v2, the team leg set per market on-chain (fees_team, currently 50% on every market) (on-chain protocol share, before any internal split).",
  ProtocolRevenue:
    "Fees collected by the rise team wallet: 75% of v1 fees and, on v2, the team leg set per market on-chain (fees_team, currently 50% on every market) (on-chain protocol share, before any internal split).",
  SupplySideRevenue:
    "Fees paid to creators: 25% of v1 fees (split per-market between the creator and the floor reserve) and, on v2, the creator and floor legs set per market on-chain (fees_creator + fees_floor, currently 50% / 0%).",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES_LABEL]: "1.25% of trade notional on buy/sell/create transactions (v1 and v2).",
    [BORROW_FEES_LABEL]: "3% of gross borrow principal taken at borrow time (v1 and v2).",
  },
  Revenue: {
    ["Trading fees to team wallet"]: "75% of v1 trade fees and the v2 team leg flowing to the rise team wallet.",
    ["Borrow fees to team wallet"]: "75% of v1 borrow fees and the v2 team leg flowing to the rise team wallet.",
  },
  ProtocolRevenue: {
    ["Trading fees to team wallet"]: "75% of v1 trade fees and the v2 team leg ending up in the rise treasury.",
    ["Borrow fees to team wallet"]: "75% of v1 borrow fees and the v2 team leg ending up in the rise treasury.",
  },
  SupplySideRevenue: {
    ["Trading fees to creator and floor reserve"]: "25% of v1 trade fees and the v2 creator + floor legs.",
    ["Borrow fees to creator and floor reserve"]: "25% of v1 borrow fees and the v2 creator + floor legs.",
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
