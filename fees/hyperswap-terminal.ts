import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
import { METRIC } from "../helpers/metrics";

interface HyperswapResponse {
  date: string;
  dailyVolume: number;
  dailyFees: number;
  dailyRevenue: number;
  timestamp: string;
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dateString = options.dateString;
  const url = `https://api-perps.hyperswap.exchange/api/defillama/daily-stats?date=${dateString}`;
  
  const headers = {
    'X-API-KEY': getEnv('HYPERSWAP_API_KEY')
  };

  const data: HyperswapResponse = await httpGet(url, { headers });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(data.dailyVolume);
  dailyFees.addUSDValue(data.dailyFees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(data.dailyRevenue, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(data.dailyFees - data.dailyRevenue, 'Refferal Fees');

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total trading volume on Hyperswap Terminal perpetual exchange in USD.",
  Fees: "Total trading fees collected from users.",
  Revenue: "Net protocol revenue after referral payouts.",
  ProtocolRevenue: "Net protocol revenue after referral payouts, allocated to protocol treasury.",
  SupplySideRevenue: "Referral fees for referrers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees charged to users on perpetual trades.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees minus referral payouts, representing net protocol revenue.",
  },
  SupplySideRevenue: {
    ['Referral Fees']: "Referral fees for referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  doublecounted: true, // volume are already counted in the hyperliquid perp adapter
  start: '2026-02-09',
  methodology,
  breakdownMethodology,
};

export default adapter;
