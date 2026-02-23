import { SimpleAdapter, FetchOptions, ChainBlocks } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const API_URL = "https://api.alphasec.trade/api/v1/defillama/stats";

const metrics = {
  TradingRebatesAndCommissions: "Trading Rebates and Commissions",
};

const fetch = async (_ts: number, _: ChainBlocks, options: FetchOptions) => {
  const url = `${API_URL}?startOfDay=${options.startOfDay}`;
  const data = await httpGet(url);
  const stats = data.result;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(stats.dailyFees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(stats.dailyRevenue, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(stats.dailySupplySideRevenue, metrics.TradingRebatesAndCommissions);

  return {
    dailyVolume: stats.dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ALPHASEC],
  start: '2025-12-02',
  methodology: {
    Volume: 'Total notional value of all trades executed on the AlphaSec DEX.',
    Fees: 'Total trading fees paid by users before any rebates or commissions are deducted.',
    SupplySideRevenue: 'Rebates and commissions paid to ecosystem participants.',
    Revenue: 'Total fees minus supply side revenue (rebates and commissions).',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Trading fees charged on all trades executed on the AlphaSec DEX, calculated as a percentage of trade notional value and paid by users before any rebates or incentives are applied.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol revenue retained by AlphaSec after paying out trading rebates and commissions to market makers, referrers, and other ecosystem participants.',
    },
    SupplySideRevenue: {
      [metrics.TradingRebatesAndCommissions]: 'Trading rebates and commissions paid to ecosystem participants including market makers, referrers, and other liquidity providers to incentivize trading activity and liquidity provision.',
    },
  },
};

export default adapter;
