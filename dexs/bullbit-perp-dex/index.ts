import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const response = await fetchURL(
    `https://beta.bullbit.ai/services/one/v1/info/trading-data?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  const todaysData = response.find((day: any) => day.date === options.startOfDay);
  if (!todaysData) {
    throw new Error(`No data found for date ${options.startOfDay}`);
  }

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  dailyVolume.addUSDValue(todaysData.totalVolume);
  dailyFees.addUSDValue(todaysData.totalFee, METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Volume is sourced via Bullbit's official API, representing executed trades on the Execute engine.",
  Fees: "Fees are sourced via Bullbit's official API, representing trading fees collected by the protocol.",
  Revenue: "All fees are revenue",
  ProtocolRevenue: "All fees go to the protocol",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees charged on perp trades",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees charged on perp trades",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Trading fees charged on perp trades",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  start: "2026-03-27",
  methodology,
  breakdownMethodology,
};

export default adapter;
