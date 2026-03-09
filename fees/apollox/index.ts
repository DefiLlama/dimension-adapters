import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const FeesAndRevenueURL = "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const { data: { alpFeeVOFor24Hour } } = await fetchURL(FeesAndRevenueURL)
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(alpFeeVOFor24Hour.fee, METRIC.TRADING_FEES);

  return {
    dailyFees,
    // dailyRevenue: alpFeeVOFor24Hour.revenue || 0,  // skipping this as we dont have a breakdown on how is returned as rebate
  };
}

const methodology = {
  Fees: "All trading fees collected from perpetual futures trading, including opening/closing positions and funding fees"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users on perpetual futures contracts, including position open/close fees and funding rate fees"
  }
}

const adapter: Adapter = {
  version: 1,
  skipBreakdownValidation: true, // skipping breakdown validation as we dont have a breakdown on how much of the fee is returned as rebate
  fetch,
  start: '2023-07-17',
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  methodology,
  breakdownMethodology
}

export default adapter;
