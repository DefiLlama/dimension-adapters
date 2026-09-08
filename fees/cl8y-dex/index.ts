import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// UTC-day rollup. Version 1: indexer cannot split a calendar day into hourly ranges.
const INDEXER_DAILY = "https://indexer.dex.cl8y.com/api/v1/defillama/daily";

function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (value === "0") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function usdOrZero(value: unknown): number {
  return asNumberOrNull(value) ?? 0;
}

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`${INDEXER_DAILY}?timestamp=${options.startOfDay}`);
  const dailyFeesUsd = asNumberOrNull(data?.daily_fees_usd);
  if (dailyFeesUsd == null) {
    throw new Error(`cl8y-dex dailyFees unpriced or missing for ${options.startOfDay}`);
  }

  const fees = data?.fees || {};
  const swapFees =
    usdOrZero(fees.swap_amm) + usdOrZero(fees.book_take) + usdOrZero(fees.limit_place);
  const wrapFees = usdOrZero(fees.wrap) + usdOrZero(fees.unwrap);
  const mintRedeemFees = usdOrZero(fees.ust1_mint) + usdOrZero(fees.ust1_redeem);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const addBreakdown = (balances: ReturnType<FetchOptions["createBalances"]>) => {
    if (swapFees) balances.addUSDValue(swapFees, METRIC.SWAP_FEES);
    if (wrapFees) balances.addUSDValue(wrapFees, METRIC.DEPOSIT_WITHDRAW_FEES);
    if (mintRedeemFees) balances.addUSDValue(mintRedeemFees, METRIC.MINT_REDEEM_FEES);
  };

  addBreakdown(dailyFees);
  const labeled = swapFees + wrapFees + mintRedeemFees;
  if (dailyFeesUsd > labeled) dailyFees.addUSDValue(dailyFeesUsd - labeled);

  const dailyRevenueUsd = asNumberOrNull(data?.daily_revenue_usd) ?? dailyFeesUsd;
  addBreakdown(dailyRevenue);
  addBreakdown(dailyProtocolRevenue);
  if (dailyRevenueUsd > labeled) {
    const remainder = dailyRevenueUsd - labeled;
    dailyRevenue.addUSDValue(remainder);
    dailyProtocolRevenue.addUSDValue(remainder);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Fees:
    "Treasury-bound pair commission (swap + book take + limit place) plus labeled wrap/window fees. spread_amount and community-tax extra-debit are not fees.",
  Revenue:
    "Treasury commission credited to the protocol on swaps, book takes, limit placements, wrap/unwrap, and UST1 mint/redeem. Excludes LP spread and community-tax debits.",
  ProtocolRevenue:
    "Net protocol income from treasury-bound commissions on trading and ancillary services (wrap/unwrap, UST1 window). No share is routed to LPs or token holders.",
  SupplySideRevenue: "0 — LPs earn inventory/spread, not a transferred commission.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Pair pool commission_amount, limit_order_fills.commission_amount, and maker placement fee to FEE_CONFIG.treasury",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Pinned wrap-mapper wrap/unwrap treasury fee",
    [METRIC.MINT_REDEEM_FEES]: "Pinned ust1-window mint/redeem fee",
  },
  Revenue: {
    [METRIC.SWAP_FEES]:
      "Treasury commission retained by the protocol on AMM swaps, book takes, and limit-order placements",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Protocol revenue from wrap-mapper treasury fees on wrap and unwrap",
    [METRIC.MINT_REDEEM_FEES]: "Protocol revenue from UST1 window mint and redeem treasury fees",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]:
      "Trading commission routed to FEE_CONFIG.treasury — the protocol's share of swap, book-take, and limit-placement activity",
    [METRIC.DEPOSIT_WITHDRAW_FEES]:
      "Wrap-mapper treasury fees on wrap and unwrap, fully retained by the protocol",
    [METRIC.MINT_REDEEM_FEES]:
      "UST1 window mint and redeem treasury fees, fully retained by the protocol",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TERRA],
  // First UTC day GET /api/v1/defillama/daily returns 200. Earlier days 404.
  start: "2026-08-17",
  methodology,
  breakdownMethodology,
};

export default adapter;
