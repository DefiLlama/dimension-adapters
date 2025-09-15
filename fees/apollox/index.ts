import { Adapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FeesAndRevenueURL = "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const fetch = async () => {

  const { data: { alpFeeVOFor24Hour } } = await fetchURL(FeesAndRevenueURL)

  return {
    dailyFees: alpFeeVOFor24Hour.fee || 0,
    dailyRevenue: alpFeeVOFor24Hour.revenue || 0,
  };
}

const adapter: Adapter = {
  runAtCurrTime: true,
  fetch,
  start: '2023-07-17',
  chains: [CHAIN.OFF_CHAIN]
}

export default adapter;
