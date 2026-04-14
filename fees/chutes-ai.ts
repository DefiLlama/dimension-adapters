import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface DailyRevenueSummary {
  date: string;
  new_subscriber_revenue: number;
  paygo_revenue: number;
  pending_instance_revenue: number;
  sponsored_inference: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const url = `https://api.chutes.ai/daily_revenue_summary`;
  const response: DailyRevenueSummary[] = await httpGet(url);
  
  const dayData = response.find(d => d.date === options.dateString);

  if (dayData) {
    dailyFees.addUSDValue(dayData.new_subscriber_revenue, "Subscription Revenue");
    dailyFees.addUSDValue(dayData.paygo_revenue, "Pay-as-you-go Revenue");
    dailyFees.addUSDValue(dayData.pending_instance_revenue, "Pending Instance Revenue");
    dailyFees.addUSDValue(dayData.sponsored_inference, "Sponsored Inference Revenue");
  }

  return { 
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.BITTENSOR],
  fetch,
  start: '2025-12-24',
  methodology: {
    Fees: "Revenue from Chutes serverless AI compute platform, including subscription fees, pay-as-you-go compute usage, private instance hosting, and sponsored inference services on the Bittensor network.",
    Revenue: "Revenue from Chutes serverless AI compute platform, including subscription fees, pay-as-you-go compute usage, private instance hosting, and sponsored inference services on the Bittensor network.",
  },
  breakdownMethodology: {
    Fees: {
      "Subscription Revenue": "Revenue from new subscriber sign-ups and subscription renewals for platform access",
      "Pay-as-you-go Revenue": "Revenue from pay-per-use compute jobs and API calls for AI model inference and processing",
      "Pending Instance Revenue": "Revenue from dedicated private compute instances awaiting deployment or in provisioning state",
      "Sponsored Inference Revenue": "Revenue from sponsored AI inference services, typically funded by third-party projects or partnerships"
    }
  }
}

export default adapter;
