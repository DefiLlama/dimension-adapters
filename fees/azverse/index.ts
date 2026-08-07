import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getAzverseDailyStats } from "../../helpers/azverse";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const { fees, builderRevenue, protocolRevenue } = await getAzverseDailyStats(options.dateString, "perp");
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(fees, "Perpetual Trading Fees");
  dailyUserFees.addUSDValue(fees, "Perpetual Trading Fees");
  dailySupplySideRevenue.addUSDValue(builderRevenue, "Builder Revenue Share");
  dailyRevenue.addUSDValue(protocolRevenue, "Protocol Revenue");

  return { dailyFees, dailyUserFees, dailySupplySideRevenue, dailyRevenue };
};

const methodology = {
  Fees: "Trading fees paid by users on AZverse perpetual markets.",
  UserFees: "All perpetual trading fees are paid directly by users.",
  SupplySideRevenue: "The builder fee share distributed to AZverse builders.",
  Revenue: "Perpetual trading fees retained by AZverse after builder revenue shares.",
};

const breakdownMethodology = {
  Fees: { "Perpetual Trading Fees": methodology.Fees },
  UserFees: { "Perpetual Trading Fees": methodology.UserFees },
  SupplySideRevenue: { "Builder Revenue Share": methodology.SupplySideRevenue },
  Revenue: { "Protocol Revenue": methodology.Revenue },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-12-31",
  methodology,
  breakdownMethodology,
};

export default adapter;
