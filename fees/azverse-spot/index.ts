import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getAzverseDailyStats } from "../../helpers/azverse";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const { volume, fees, builderRevenue, protocolRevenue } = await getAzverseDailyStats(options.dateString, "spot");
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees, "Spot Trading Fees");
  dailyUserFees.addUSDValue(fees, "Spot Trading Fees");
  dailySupplySideRevenue.addUSDValue(builderRevenue, "Builder Revenue Share");
  dailyRevenue.addUSDValue(protocolRevenue, "Protocol Revenue");

  return { dailyVolume, dailyFees, dailyUserFees, dailySupplySideRevenue, dailyRevenue };
};

const methodology = {
  Volume: "USD notional volume traded on AZverse spot markets.",
  Fees: "Trading fees paid by users on AZverse spot markets.",
  UserFees: "All spot trading fees are paid directly by users.",
  SupplySideRevenue: "The builder fee share distributed to AZverse builders.",
  Revenue: "Spot trading fees retained by AZverse after builder revenue shares.",
};

const breakdownMethodology = {
  Fees: { "Spot Trading Fees": methodology.Fees },
  UserFees: { "Spot Trading Fees": methodology.UserFees },
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
