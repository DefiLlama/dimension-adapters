import { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
const api_fee = "https://api.ref.finance/get-burrow-total-fee"
const api_revenue = "https://api.ref.finance/get-burrow-total-revenue"
const adapter: SimpleAdapter = {
    adapter: {
        "near": {
          start: 1747288898,
          fetch: async () => {
            const fee_result = await httpGet(api_fee);
            const revenue_result = await httpGet(api_revenue);
            return {
                dailyFees: fee_result?.data?.total_fee || '0',
                dailyRevenue: revenue_result?.data.total_revenue || '0',
            }
          }
        }
    }
};

export default adapter;
