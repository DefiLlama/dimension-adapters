import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Daily Sui network revenue published by the data team. Keyed by "YYYY-MM-DD",
// already filtered to non-anomalous rows, starts 2026-01-01 and lags ~3 days.
const REVENUE_URL = 'https://storage.googleapis.com/sui-public-data/sui-revenue.json';

const fetch = async (options: FetchOptions) => {

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // Yield earned on the reserves backing the USDsui and suiUSDe stablecoins (USD).
  // Available from 2026-01-01 with a ~3-day lag;
  const revenueByDate = await fetchURL(REVENUE_URL);

  const day = revenueByDate[options.dateString];

  if(!day) {
    throw new Error(`Sui Foundation: no data found for date ${options.dateString}`);
  }

  dailyFees.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD, "Stablecoin Yields");
  dailyRevenue.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD, "Stablecoin Yields");
  dailyProtocolRevenue.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD, "Stablecoin Yields");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins retained by sui foundation",
  Revenue: "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins retained by sui foundation",
  ProtocolRevenue: "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins retained by sui foundation",
}

const breakdownMethodology = {
  Fees: {
    "Stablecoin Yields": "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins",
  },
  Revenue: {
    "Stablecoin Yields": "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins",
  },
  ProtocolRevenue: {
    "Stablecoin Yields": "Yield earned on the reserves backing the USDsui and suiUSDe stablecoins",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-01-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
