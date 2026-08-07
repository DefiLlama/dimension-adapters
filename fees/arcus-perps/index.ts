import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/stats/perp/fees/daily";

const MAKER_REBATES = "Maker Rebates";
const REFERRAL_FEES = "Referral Fees";

// Number('') and Number(null) are 0, so reject non-numeric fields before coercing.
const parseAmount = (value: any, field: string, date: string) => {
  const usable = typeof value === "number" || (typeof value === "string" && value.trim() !== "");
  const amount = usable ? Number(value) : NaN;
  if (!Number.isFinite(amount)) throw new Error(`Arcus perp fees: bad ${field} for ${date}`);
  return amount;
};

const fetch = async (options: FetchOptions) => {
  const { rows } = await fetchURL(`${API}?from=${options.dateString}&to=${options.dateString}`);
  const row = rows?.find((r: any) => r.date === options.dateString);
  if (!row) throw new Error(`No Arcus perp fee data for ${options.dateString}`);

  const feesGross = parseAmount(row.feesGross, "feesGross", options.dateString);
  const makerRebates = parseAmount(row.makerRebates, "makerRebates", options.dateString);
  const referralPayouts = parseAmount(row.referralPayouts, "referralPayouts", options.dateString);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(feesGross, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(makerRebates, MAKER_REBATES);
  dailySupplySideRevenue.addUSDValue(referralPayouts, REFERRAL_FEES);
  // Matches the API's own `revenue` field: feesGross - makerRebates - referralPayouts.
  dailyRevenue.addUSDValue(feesGross - makerRebates - referralPayouts, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Gross taker and maker trading fees paid by traders on Arcus perpetual markets.",
  UserFees: "Gross trading fees paid by traders.",
  SupplySideRevenue: "Maker rebates paid back to liquidity providers plus payouts to referral partners.",
  Revenue: "Trading fees kept by Arcus after maker rebates and referral payouts.",
  ProtocolRevenue: "All retained trading fees go to the protocol treasury; Arcus has no token distribution.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Gross perpetual trading fees charged on every fill.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Gross perpetual trading fees charged on every fill.",
  },
  SupplySideRevenue: {
    [MAKER_REBATES]: "Portion of trading fees rebated to makers for providing liquidity.",
    [REFERRAL_FEES]: "Portion of trading fees paid out to referral partners.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees retained by Arcus after maker rebates and referral payouts.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Retained trading fees accruing to the Arcus treasury.",
  },
};

// version 1: the stats API only exposes UTC-daily buckets.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
