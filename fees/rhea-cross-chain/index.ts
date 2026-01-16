import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const api_fee = "https://api.ref.finance/get-total-fee"
const api_revenue = "https://api.ref.finance/get-total-revenue"

const fetch = async (options: FetchOptions) => {
  const fee_result = await httpGet(api_fee);
  const revenue_result = await httpGet(api_revenue);

  return {
    dailyFees: fee_result.fee_data.cross_chain_fee,
    dailyRevenue: revenue_result.revenue_data.cross_chain_revenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2026-01-12',
  runAtCurrTime: true,
};

export default adapter;
