import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const volumeRes = await httpGet(`${API_BASE}/perp/volume?timestamp=${options.startOfDay}`)
  const feesRes = await httpGet(`${API_BASE}/perp/fees?timestamp=${options.startOfDay}`)

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(feesRes.dailyFees, 'SoDEX Perps Fees');
  dailyRevenue.addUSDValue(feesRes.dailyRevenue, 'SoDEX Perps Fees To Protocol');
  dailySupplySideRevenue.addUSDValue(Number(feesRes.dailyFees) - Number(feesRes.dailyRevenue), 'SoDEX Perps Fees To LPs');
  
  return {
    dailyVolume: volumeRes.dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.VALUECHAIN]: {
      fetch,
      start: "2025-10-20",
    },
  },
  methodology: {
    Fees: "Trading fees collected from perpetual markets.",
    Revenue: "Protocol revenue after referral payouts.",
    ProtocolRevenue: "Revenue directed to the protocol treasury.",
    SupplySideRevenue: "Fees are distributed to LPs and referrals.",
  },
  breakdownMethodology: {
    Fees: {
      'SoDEX Perps Fees': 'Trading fees collected from perpetual markets',
    },
    Revenue: {
      'SoDEX Perps Fees To Protocol': 'Trading fees collected by protocol.',
    },
    SupplySideRevenue: {
      'SoDEX Perps Fees To LPs': 'Trading fees distributed to LPs.',
    },
  },
};

export default adapter;
