import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// 24h totals in USD from Rhea's API, no date params (Rhea Lend is the Burrow contract, contract.main.burrow.near).
// Borrow interest is split by each asset's reserve_ratio (get_assets_paged): 25% on every borrowed asset goes to
// the protocol reserve, the rest accrues to suppliers.
const api_fee = "https://api.ref.finance/get-burrow-total-fee"
const api_revenue = "https://api.ref.finance/get-burrow-total-revenue"

const fetch = async (options: FetchOptions) => {
  const fee_result = await httpGet(api_fee);
  const revenue_result = await httpGet(api_revenue);
  const rawFees = fee_result?.data?.total_fee;
  const rawRevenue = revenue_result?.data?.total_revenue;
  const fees = Number(rawFees);
  const revenue = Number(rawRevenue);
  // Number(null) and Number('') are 0, so check the raw fields too
  if (rawFees == null || rawFees === '' || rawRevenue == null || rawRevenue === ''
    || !Number.isFinite(fees) || !Number.isFinite(revenue) || revenue > fees)
    throw new Error(`rhea-lend: unexpected API response ${JSON.stringify({ fee_result, revenue_result })}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(revenue, METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(fees - revenue, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEAR]: {
      start: '2025-05-15',
      fetch,
      runAtCurrTime: true,
    }
  },
  methodology: {
    Fees: 'Interest paid by borrowers on Rhea Lend.',
    Revenue: "The share of borrow interest kept by the protocol reserve (each asset's reserve_ratio).",
    SupplySideRevenue: 'Borrow interest earned by suppliers, after the protocol reserve share.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on Rhea Lend.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "The share of borrow interest kept by the protocol reserve (each asset's reserve_ratio).",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest earned by suppliers, after the protocol reserve share.',
    },
  },
};

export default adapter;
