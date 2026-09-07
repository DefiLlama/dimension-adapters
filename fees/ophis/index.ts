import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, ophisChainConfig } from "../../helpers/ophis";

const OPHIS_FEES = "Ophis swap fees";
const OPHIS_REVENUE = "Ophis protocol revenue";
const COW_HOSTED_SHARE = "CoW Protocol hosted-chain share";

const fetch = async (options: FetchOptions) => {
  const row = await fetchOphisChainDay(options);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(row?.feesUsd ?? 0, OPHIS_FEES);
  dailyRevenue.addUSDValue(row?.revenueUsd ?? 0, OPHIS_REVENUE);
  dailySupplySideRevenue.addUSDValue(row?.supplySideRevenueUsd ?? 0, COW_HOSTED_SHARE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

// Fee policy and hosted-chain share sources:
// https://github.com/ophis-fi/ophis/blob/main/apps/rebate-indexer/src/stats-page.ts
// https://github.com/ophis-fi/ophis/blob/main/apps/rebate-indexer/src/earnings.ts
const methodology = {
  Fees: "Ophis fees assessed on successfully settled Ophis-attributed fills, including the 1 bp base fee and capped price-improvement capture. Values come from Ophis' settlement-fill ledger, are bucketed by settlement date, and are valued in USD by the reporting indexer.",
  Revenue: "Fees retained by Ophis. Ophis-operated chains retain the full fee; on CoW-hosted chains this is net of CoW Protocol's 25% partner-fee share.",
  ProtocolRevenue: "Revenue retained by Ophis after CoW Protocol's hosted-chain share.",
  SupplySideRevenue: "CoW Protocol's 25% share of Ophis fees on CoW-hosted chains; zero on Ophis-operated chains.",
};

const breakdownMethodology = {
  Fees: {
    [OPHIS_FEES]: "Base and capped price-improvement fees assessed on successfully settled Ophis fills.",
  },
  Revenue: {
    [OPHIS_REVENUE]: "Fees retained by Ophis after any hosted-chain share.",
  },
  ProtocolRevenue: {
    [OPHIS_REVENUE]: "Fees retained by Ophis after any hosted-chain share.",
  },
  SupplySideRevenue: {
    [COW_HOSTED_SHARE]: "CoW Protocol's share on CoW-hosted chains.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: ophisChainConfig,
};

export default adapter;
