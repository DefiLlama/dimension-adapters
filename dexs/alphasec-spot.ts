import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const API_URL = "https://api.alphasec.trade/api/v1/defillama/stats";

const fetch = async () => {
  const data = await httpGet(API_URL);
  const stats = data.result;

  return {
    dailyVolume: stats.volume.daily,
    dailyFees: stats.fees.daily,
    dailyRevenue: stats.revenue.daily,
    dailySupplySideRevenue: stats.supplySideRevenue.daily,
  };
};

export default {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.ALPHASEC],
  methodology: {
    Volume: 'Total notional value of all trades executed on the AlphaSec DEX.',
    Fees: 'Total trading fees paid by users before any rebates or commissions are deducted.',
    SupplySideRevenue: 'Rebates and commissions paid to ecosystem participants.',
    Revenue: 'Total fees minus supply side revenue (rebates and commissions).',
  },
};
