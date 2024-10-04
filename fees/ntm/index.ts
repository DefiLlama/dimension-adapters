/* NTM.ai Adapter */

import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getPrices } from "../../utils/prices";
import { httpGet } from "../../utils/fetchURL";

const endpoint = "https://api.ntm.ai/feesAndRevenues.php?"

const fetchFeesAndRevenues = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0];
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0];
  const res = await httpGet(`${endpoint}start_date=${startTime}&end_date=${endTime}&chain=${options.chain}`);
  const prices = await getPrices(["coingecko:the-open-network", "coingecko:avalanche-2", "coingecko:binancecoin", "coingecko:ethereum", "coingecko:tron", "coingecko:solana"], options.startTimestamp);
  var daily_fees = 0;
  var daily_revenue = 0;
  if(options.chain == "solana"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:solana"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:solana"].price;
  }else if(options.chain == "avax"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:avalanche-2"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:avalanche-2"].price;
  }else if(options.chain == "bsc"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:binancecoin"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:binancecoin"].price;
  }else if(options.chain == "ethereum"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:ethereum"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:ethereum"].price;
  }else if(options.chain == "tron"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:tron"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:tron"].price;
  }else if(options.chain == "ton"){
    daily_fees = parseInt(res.fees_total) * prices["coingecko:the-open-network"].price;
    daily_revenue = parseInt(res.revenue_total) * prices["coingecko:the-open-network"].price;
  }
  return {
    dailyFees: `${daily_fees}`,
    dailyRevenue: `${daily_revenue}`,
    timestamp: options.startTimestamp,
  }
}

const adapter: Adapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.AVAX, CHAIN.SOLANA, CHAIN.TRON, CHAIN.TON].reduce((all, chain) => ({
    ...all,
    [chain]: {
        fetch: fetchFeesAndRevenues,
        start: 1684771200,
        meta: {
          methodology: 'sums the fees of listing request & trending request.',
        }
    }
  }))
}

export default adapter;