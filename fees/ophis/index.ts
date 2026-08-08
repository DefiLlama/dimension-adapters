import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, OPHIS_CHAINS } from "../../helpers/ophis";

const LABELS = {
  FEES: "Ophis Volume Fees",
  REVENUE: "Volume Fees Retained By Ophis",
  SUPPLY_SIDE: "CoW Protocol Service Share",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const row = await fetchOphisChainDay(options);

  if (row) {
    dailyFees.addUSDValue(row.feesUsd, LABELS.FEES);
    dailyRevenue.addUSDValue(row.revenueUsd, LABELS.REVENUE);
    dailyProtocolRevenue.addUSDValue(row.revenueUsd, LABELS.REVENUE);
    dailySupplySideRevenue.addUSDValue(row.supplySideRevenueUsd, LABELS.SUPPLY_SIDE);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Gross flat volume fee encoded in each settled Ophis order's appData, using the executed USD volume and that order's verified 1, 5, or 10 bps rate.",
  Revenue: "Ophis retains 100% of its volume fee on Ophis-operated chains and 75% on CoW-hosted chains after CoW Protocol's 25% service share.",
  ProtocolRevenue: "The volume-fee portion retained by the Ophis protocol.",
  SupplySideRevenue: "CoW Protocol's 25% service share of Ophis partner fees on CoW-hosted chains; zero on Ophis-operated chains.",
};

const breakdownMethodology = {
  Fees: { [LABELS.FEES]: methodology.Fees },
  Revenue: { [LABELS.REVENUE]: methodology.Revenue },
  ProtocolRevenue: { [LABELS.REVENUE]: methodology.ProtocolRevenue },
  SupplySideRevenue: { [LABELS.SUPPLY_SIDE]: methodology.SupplySideRevenue },
};

const adapter: SimpleAdapter = {
  fetch,
  start: "2026-05-14",
  chains: Object.keys(OPHIS_CHAINS),
  methodology,
  breakdownMethodology,
};

export default adapter;
