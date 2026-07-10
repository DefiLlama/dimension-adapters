import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1/daily_stats";

interface DailyStatsResponse {
  daily_volume: number;
  daily_fees: number;
  daily_revenue: number;
  open_interest: number;
}

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const data: DailyStatsResponse = await httpGet(url, {
    headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(data.daily_fees, 'Taker Trading Fees');

  dailyRevenue.addUSDValue(data.daily_revenue, 'Taker Trading Fees To Protocol');
  dailyProtocolRevenue.addUSDValue(data.daily_revenue, 'Taker Trading Fees To Protocol');

  dailySupplySideRevenue.addUSDValue(data.daily_fees - data.daily_revenue, 'Maker Rebates');

  return {
    dailyVolume: data.daily_volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    openInterestAtEnd: data.open_interest,
  };
};

const methodology = {
  Volume: "Sum of notional value of all taker fills across perpetual futures markets.",
  Fees: "Trading fees collected from takers on all perpetual futures markets.",
  Revenue: "Trading fees kept by the protocol after paying maker rebates.",
  ProtocolRevenue: "Trading fees kept by the protocol treasury. Decibel has no live token yet, so none is distributed to token holders.",
  SupplySideRevenue: "Maker rebates paid back to liquidity-providing makers out of the trading fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-02-10",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      'Taker Trading Fees': 'Trading fees collected from takers on all perpetual futures markets.',
    },
    Revenue: {
      'Taker Trading Fees To Protocol': 'Trading fees kept by the protocol treasury after paying maker rebates.',
    },
    ProtocolRevenue: {
      'Taker Trading Fees To Protocol': 'Trading fees kept by the protocol treasury. Decibel has no live token yet, so none is distributed to token holders.',
    },
    SupplySideRevenue: {
      'Maker Rebates': 'Maker rebates paid back to liquidity-providing makers out of the trading fees.',
    },
  },
};

export default adapter;
