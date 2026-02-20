import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const API_URL = "https://api.alphasec.trade/api/v1/defillama/stats";

const fetch = async (_ts: number, _cb: any, options: FetchOptions) => {
  const url = `${API_URL}?startOfDay=${options.startOfDay}`;
  const data = await httpGet(url);
  const stats = data.result;

  return {
    dailyVolume: stats.dailyVolume,
    dailyFees: stats.dailyFees,
    dailyRevenue: stats.dailyRevenue,
    dailySupplySideRevenue: stats.dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ALPHASEC]: {
      fetch,
      start: 1764720000,
    },
  },
  methodology: {
    Volume: 'Total notional value of all trades executed on the AlphaSec DEX.',
    Fees: 'Total trading fees paid by users before any rebates or commissions are deducted.',
    SupplySideRevenue: 'Rebates and commissions paid to ecosystem participants.',
    Revenue: 'Total fees minus supply side revenue (rebates and commissions).',
  },
};

export default adapter;
