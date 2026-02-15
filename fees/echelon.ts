import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const feesQueryURL = "https://app.echelon.market/api/defillama/fees?timeframe=";
const revenueQueryURL = "https://app.echelon.market/api/defillama/revenue?timeframe=";

interface IVolumeall {
  value: number;
  timestamp: string;
}

const buildURL = (baseURL: string, timeframe: string, endTimestamp: number, networkParam?: string) => {
  let url = baseURL + timeframe;
  if (endTimestamp) {
    url += `&endTimestamp=${endTimestamp}`;
  }
  if (networkParam) {
    url += networkParam;
  }
  return url;
};

const fees_url = (endTimestamp: number, timeframe: string) => buildURL(feesQueryURL, timeframe, endTimestamp);
const movementFees_url = (endTimestamp: number, timeframe: string) => buildURL(feesQueryURL, timeframe, endTimestamp, "&network=movement_mainnet");
const revenue_url = (endTimestamp: number, timeframe: string) => buildURL(revenueQueryURL, timeframe, endTimestamp);
const movementRevenue_url = (endTimestamp: number, timeframe: string) => buildURL(revenueQueryURL, timeframe, endTimestamp, "&network=movement_mainnet");

const config: Record<string, { fees: (endTimestamp: number, timeframe: string) => string, revenue: (endTimestamp: number, timeframe: string) => string }> = {
  [CHAIN.APTOS]: {
    fees: fees_url,
    revenue: revenue_url,
  },
  [CHAIN.MOVE]: {
    fees: movementFees_url,
    revenue: movementRevenue_url,
  },
}

const sumValues = (data: IVolumeall[]) => 
  data.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);
    
const fetch = async (timestamp: number, _:any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const dayFeesQuery = (await fetchURL(config[options.chain].fees(timestamp, "1D")))?.data;
  const feesValue = sumValues(dayFeesQuery);
  dailyFees.addGasToken(feesValue, 'Lending Fees');

  const dayRevenueQuery = (await fetchURL(config[options.chain].revenue(timestamp, "1D")))?.data;
  const revenueValue = sumValues(dayRevenueQuery);
  dailyRevenue.addGasToken(revenueValue, 'Protocol Share');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total fees comprise borrowing origination fees, accumulated interest (from both protocol and lenders), and liquidation fees",
  Revenue: "Revenue includes protocol fees, protocol share of interest fees, and protocol share of liquidation fees",
  ProtocolRevenue: "Revenue includes protocol fees, protocol share of interest fees, and protocol share of liquidation fees",
}

const breakdownMethodology = {
  Fees: {
    'Lending Fees': 'Total fees from borrowing origination fees, accumulated interest paid by borrowers, and liquidation penalties',
  },
  Revenue: {
    'Protocol Share': 'Protocol\'s portion of lending fees including protocol fees, protocol share of borrow interest, and protocol share of liquidation fees',
  },
  ProtocolRevenue: {
    'Protocol Share': 'Protocol\'s portion of lending fees including protocol fees, protocol share of borrow interest, and protocol share of liquidation fees',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-04-25',
    },
    [CHAIN.MOVE]: {
      fetch,
      start: '2025-03-15',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
