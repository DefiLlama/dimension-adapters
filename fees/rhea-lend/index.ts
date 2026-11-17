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
  // Number() turns null, '', ' ' and false into 0, so only accept numbers and nonblank strings
  const isNumeric = (v: any) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '');
  const fees = Number(rawFees);
  const revenue = Number(rawRevenue);
  if (!isNumeric(rawFees) || !isNumeric(rawRevenue)
    || !Number.isFinite(fees) || !Number.isFinite(revenue) || revenue < 0 || revenue > fees)
    throw new Error(`rhea-lend: unexpected API response ${JSON.stringify({ fee_result, revenue_result })}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(revenue, METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(fees - revenue, METRIC.BORROW_INTEREST);
  dailyProtocolRevenue.addUSDValue(revenue, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
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
    ProtocolRevenue: "The protocol's share of borrow interest (each asset's reserve_ratio), held in the protocol reserve or paid to the Rhea-controlled account pf.rhealab.near.",
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
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "The protocol's share of borrow interest (each asset's reserve_ratio), held in the protocol reserve or paid to the Rhea-controlled account pf.rhealab.near.",
    },
  },
};

export default adapter;
