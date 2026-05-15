import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";

const FDIT = "0x48ab4e39ac59f4e88974804b04a991b3a402717f";
const FUND_NO = "9053";
// Source: Fidelity FYOXX/FDIT historical pricing API; SEC prospectus lists 0.2% net annual fund expenses.
const FIDELITY_HISTORICAL_PRICING_URL = "https://institutional.fidelity.com/app/funds/historicalFundPricing";
const NET_EXPENSE_RATIO = 0.002;

const toFidelityDate = (dateString: string) => {
  const [year, month, day] = dateString.split("-");
  return `${month}/${day}/${year}`;
};

async function getPricing(dateString: string) {
  const fidelityDate = toFidelityDate(dateString);
  const response: any = await httpPost(
    FIDELITY_HISTORICAL_PRICING_URL,
    new URLSearchParams({ fundNo: FUND_NO, startDate: fidelityDate, endDate: fidelityDate }).toString(),
    { headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } }
  );

  if (response.status !== "success") throw new Error(`Fidelity historical pricing request failed for ${dateString}`);

  return {
    milRate: Number(response.prices?.find((item: any) => item.date === dateString)?.milRate) || undefined,
  };
}

const fetch = async (_: any, _1: any, options: any) => {
  const pricing = await getPricing(options.dateString);

  if (pricing.milRate === undefined) {
    throw new Error(`No Fidelity mil-rate found for ${options.dateString}`);
  }

  const supply = await options.fromApi.call({
    target: FDIT,
    abi: "erc20:totalSupply",
  });
  const fditSupply = Number(supply) / 1e18;

  const dailyDividends = fditSupply * pricing.milRate;
  const dailyFundFees = fditSupply * NET_EXPENSE_RATIO / 365;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyDividends, METRIC.ASSETS_YIELDS);
  dailyFees.addUSDValue(dailyFundFees, METRIC.MANAGEMENT_FEES);
  dailySupplySideRevenue.addUSDValue(dailyDividends, METRIC.ASSETS_YIELDS);
  dailyRevenue.addUSDValue(dailyFundFees, METRIC.MANAGEMENT_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Daily dividends paid to FDIT holders plus fund expenses accrued by Fidelity Treasury Digital Fund - OnChain Class.",
  Revenue: "Net annual operating expenses after fee waivers or reimbursements, accrued daily on FDIT AUM.",
  ProtocolRevenue: "Net annual operating expenses after fee waivers or reimbursements, accrued daily on FDIT AUM.",
  SupplySideRevenue: "Daily dividends paid to FDIT holders, calculated from Fidelity's daily mil-rate and start-of-day FDIT supply.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Daily dividends paid to FDIT holders from Fidelity's published mil-rate.",
    [METRIC.MANAGEMENT_FEES]: "Net fund expenses accrued daily using Fidelity's expense ratio.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Net fund expenses accrued daily to Fidelity using Fidelity's expense ratio.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Net fund expenses accrued daily to Fidelity using Fidelity's expense ratio.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Daily dividends paid to FDIT holders from Fidelity's published mil-rate.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-08-04",
    },
  },
};

export default adapter;
