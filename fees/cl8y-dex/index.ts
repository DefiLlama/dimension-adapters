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
  if (swapFees) dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
  if (wrapFees) dailyFees.addUSDValue(wrapFees, METRIC.DEPOSIT_WITHDRAW_FEES);
  if (mintRedeemFees) dailyFees.addUSDValue(mintRedeemFees, METRIC.MINT_REDEEM_FEES);
  const labeled = swapFees + wrapFees + mintRedeemFees;
  if (dailyFeesUsd > labeled) dailyFees.addUSDValue(dailyFeesUsd - labeled);

  dailyRevenue.addUSDValue(asNumberOrNull(data?.daily_revenue_usd) ?? dailyFeesUsd);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Fees:
    "Treasury-bound pair commission (swap + book take + limit place) plus labeled wrap/window fees. spread_amount and community-tax extra-debit are not fees.",
  Revenue: "Same as Fees — protocol keeps pair treasury commission.",
  ProtocolRevenue: "Same as Fees.",
  SupplySideRevenue: "0 — LPs earn inventory/spread, not a transferred commission.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Pair pool commission_amount, limit_order_fills.commission_amount, and maker placement fee to FEE_CONFIG.treasury",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Pinned wrap-mapper wrap/unwrap treasury fee",
    [METRIC.MINT_REDEEM_FEES]: "Pinned ust1-window mint/redeem fee",
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
